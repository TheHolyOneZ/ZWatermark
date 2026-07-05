

use std::io::Read;
use std::time::{SystemTime, UNIX_EPOCH};

use der::{
    asn1::{GeneralizedTime, ObjectIdentifier, OctetString},
    Encode, Reader, Sequence, Tag,
};
use serde::{Deserialize, Serialize};


const OID_SHA256: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.1");

const OID_TST_INFO: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.1.4");

#[derive(Debug, thiserror::Error)]
pub enum Rfc3161Error {
    #[error("http: {0}")]
    Http(String),
    #[error("tsa rejected request (pki status: {0})")]
    TsaRejected(i64),
    #[error("der: {0}")]
    Der(String),
    #[error("digest mismatch: response references a different image")]
    DigestMismatch,
    #[error("could not extract genTime from response")]
    NoGenTime,
    #[error("network timeout")]
    Timeout,
}

impl From<der::Error> for Rfc3161Error {
    fn from(e: der::Error) -> Self {
        Rfc3161Error::Der(e.to_string())
    }
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rfc3161Token {
    pub tsa_url: String,

    pub response_der: Vec<u8>,

    pub obtained_epoch_s: u64,
}


#[derive(Debug, Clone)]
pub struct VerifiedRfc3161 {
    pub tsa_url: String,
    pub gen_time_epoch_s: u64,
    pub gen_time_iso: String,

    pub attested_digest_hex: String,
}


#[derive(Sequence)]
struct AlgIdentifier {
    algorithm: ObjectIdentifier,


    parameters: Option<der::asn1::Null>,
}

#[derive(Sequence)]
struct MessageImprint {
    hash_algorithm: AlgIdentifier,
    hashed_message: OctetString,
}

#[derive(Sequence)]
struct TimeStampReqAsn1 {
    version: i64,
    message_imprint: MessageImprint,

    cert_req: bool,
}

fn build_request(digest_sha256: &[u8; 32]) -> Result<Vec<u8>, Rfc3161Error> {
    let req = TimeStampReqAsn1 {
        version: 1,
        message_imprint: MessageImprint {
            hash_algorithm: AlgIdentifier {
                algorithm: OID_SHA256,
                parameters: Some(der::asn1::Null),
            },
            hashed_message: OctetString::new(digest_sha256.to_vec())?,
        },
        cert_req: true,
    };
    Ok(req.to_der()?)
}


pub fn request_rfc3161(
    tsa_url: &str,
    digest_sha256: &[u8; 32],
) -> Result<Rfc3161Token, Rfc3161Error> {
    let body = build_request(digest_sha256)?;


    let mut last_err: Option<Rfc3161Error> = None;
    for attempt in 0..2 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        match do_request(tsa_url, &body) {
            Ok(token) => return Ok(token),
            Err(e) => {
                let retryable = matches!(e, Rfc3161Error::Timeout);
                last_err = Some(e);
                if !retryable {
                    break;
                }
            }
        }
    }
    Err(last_err.unwrap_or(Rfc3161Error::Timeout))
}

fn do_request(tsa_url: &str, body: &[u8]) -> Result<Rfc3161Token, Rfc3161Error> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(20))
        .build();

    let resp = agent
        .post(tsa_url)
        .set("Content-Type", "application/timestamp-query")
        .set("Accept", "application/timestamp-reply")
        .send_bytes(body)
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => Rfc3161Error::Http(format!("HTTP {code}")),
            ureq::Error::Transport(t) => {
                if t.kind() == ureq::ErrorKind::Io {
                    Rfc3161Error::Timeout
                } else {
                    Rfc3161Error::Http(t.to_string())
                }
            }
        })?;

    let mut buf = Vec::with_capacity(4096);
    resp.into_reader()
        .take(1 << 20)
        .read_to_end(&mut buf)
        .map_err(|e| Rfc3161Error::Http(e.to_string()))?;

    peek_status(&buf)?;

    Ok(Rfc3161Token {
        tsa_url: tsa_url.to_string(),
        response_der: buf,
        obtained_epoch_s: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    })
}


fn peek_status(response_der: &[u8]) -> Result<(), Rfc3161Error> {
    let mut reader = der::SliceReader::new(response_der)?;
    reader.sequence(|inner| {

        let status: i64 = inner.sequence(|s| s.decode())?;
        if status == 0 || status == 1 {
            Ok(())
        } else {
            Err(der::Error::from(der::ErrorKind::Value {
                tag: Tag::Integer,
            }))
        }
    }).map_err(|_| Rfc3161Error::TsaRejected(-1))
}


pub fn verify_rfc3161(
    token: &Rfc3161Token,
    expected_digest: &[u8; 32],
) -> Result<VerifiedRfc3161, Rfc3161Error> {
    let (gen_time_epoch_s, gen_time_iso, attested) = extract_tst_info(&token.response_der)?;

    if attested.len() != 32 || attested.as_slice() != expected_digest.as_slice() {
        return Err(Rfc3161Error::DigestMismatch);
    }

    Ok(VerifiedRfc3161 {
        tsa_url: token.tsa_url.clone(),
        gen_time_epoch_s,
        gen_time_iso,
        attested_digest_hex: hex::encode(&attested),
    })
}


fn extract_tst_info(response_der: &[u8]) -> Result<(u64, String, Vec<u8>), Rfc3161Error> {


    let tst_oid_der = OID_TST_INFO.to_der()?;
    let idx = find_subslice(response_der, &tst_oid_der).ok_or(Rfc3161Error::NoGenTime)?;


    let mut cursor = idx + tst_oid_der.len();
    let tst_info = find_octet_string_after(response_der, &mut cursor)?;
    let inner = TstInfoAsn1::from_der(&tst_info)?;

    let imprint = inner.message_imprint.hashed_message.as_bytes().to_vec();
    let gt = inner.gen_time;
    let secs = gt.to_unix_duration().as_secs();
    let iso = generalized_time_to_iso(secs);

    Ok((secs, iso, imprint))
}

fn find_subslice(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}


fn find_octet_string_after(buf: &[u8], cursor: &mut usize) -> Result<Vec<u8>, Rfc3161Error> {
    let start = *cursor;
    for i in start..buf.len().saturating_sub(2) {
        if buf[i] == 0x04 {

            let (len, hdr_len) = parse_der_length(&buf[i + 1..]).ok_or(Rfc3161Error::NoGenTime)?;
            let content_start = i + 1 + hdr_len;
            let content_end = content_start.checked_add(len).ok_or(Rfc3161Error::NoGenTime)?;
            if content_end > buf.len() {
                continue;
            }


            if buf.get(content_start) != Some(&0x30) {
                continue;
            }
            *cursor = content_end;
            return Ok(buf[content_start..content_end].to_vec());
        }
    }
    Err(Rfc3161Error::NoGenTime)
}

fn parse_der_length(buf: &[u8]) -> Option<(usize, usize)> {
    let first = *buf.first()?;
    if first & 0x80 == 0 {
        Some((first as usize, 1))
    } else {
        let n = (first & 0x7F) as usize;
        if n == 0 || n > 4 || buf.len() < 1 + n {
            return None;
        }
        let mut len = 0usize;
        for i in 0..n {
            len = (len << 8) | (buf[1 + i] as usize);
        }
        Some((len, 1 + n))
    }
}

#[derive(Sequence)]
struct TstInfoAsn1 {
    version: i64,
    policy: ObjectIdentifier,
    message_imprint: MessageImprint,
    serial_number: der::asn1::Int,
    gen_time: GeneralizedTime,


}


impl TstInfoAsn1 {
    fn from_der(bytes: &[u8]) -> Result<Self, der::Error> {
        let mut r = der::SliceReader::new(bytes)?;
        r.sequence(|inner| {
            let version: i64 = inner.decode()?;
            let policy: ObjectIdentifier = inner.decode()?;
            let message_imprint: MessageImprint = inner.decode()?;
            let serial_number: der::asn1::Int = inner.decode()?;
            let gen_time: GeneralizedTime = inner.decode()?;

            while !inner.is_finished() {
                let _: der::AnyRef = inner.decode()?;
            }
            Ok(TstInfoAsn1 {
                version,
                policy,
                message_imprint,
                serial_number,
                gen_time,
            })
        })
    }
}

fn generalized_time_to_iso(epoch_s: u64) -> String {


    let (y, mo, d, h, mi, s) = epoch_to_ymdhms(epoch_s);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, mo, d, h, mi, s
    )
}

fn epoch_to_ymdhms(secs: u64) -> (i32, u32, u32, u32, u32, u32) {

    let days = (secs / 86_400) as i64;
    let sod = (secs % 86_400) as u32;
    let h = sod / 3600;
    let mi = (sod % 3600) / 60;
    let s = sod % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if mo <= 2 { y + 1 } else { y } as i32;
    (y, mo, d, h, mi, s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_request_shape() {

        let d = [0u8; 32];
        let der = build_request(&d).expect("encode");

        assert_eq!(der[0], 0x30);

        assert!(der.windows(3).any(|w| w == [0x02, 0x01, 0x01]));
    }

    #[test]
    fn epoch_conversion_matches_known_date() {

        let (y, mo, d, h, mi, s) = epoch_to_ymdhms(946_684_800);
        assert_eq!((y, mo, d, h, mi, s), (2000, 1, 1, 0, 0, 0));

        let (y, mo, d, h, mi, s) = epoch_to_ymdhms(0);
        assert_eq!((y, mo, d, h, mi, s), (1970, 1, 1, 0, 0, 0));
    }
}
