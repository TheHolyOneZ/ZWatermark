

use std::io::Read;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha256};


pub const OTS_HEADER: &[u8] = b"\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94";


pub const OTS_MAJOR_VERSION: u64 = 1;


const OP_SHA1: u8 = 0x02;
const OP_RIPEMD160: u8 = 0x03;
const OP_SHA256: u8 = 0x08;
const OP_KECCAK256: u8 = 0x67;
const OP_APPEND: u8 = 0xf0;
const OP_PREPEND: u8 = 0xf1;

const TAG_ATTESTATION: u8 = 0x00;
const TAG_FORK: u8 = 0xff;


const ATT_TAG_PENDING: [u8; 8] = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];
const ATT_TAG_BITCOIN: [u8; 8] = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];
const ATT_TAG_LITECOIN: [u8; 8] = [0x06, 0x86, 0x9a, 0x0d, 0x73, 0xd7, 0x1b, 0x45];
const ATT_TAG_ETHEREUM: [u8; 8] = [0x30, 0xfe, 0x80, 0x87, 0xb5, 0xc7, 0xea, 0xd7];

#[derive(Debug, thiserror::Error)]
pub enum OtsError {
    #[error("http: {0}")]
    Http(String),
    #[error("network timeout")]
    Timeout,
    #[error("bad ots header (not an OpenTimestamps proof)")]
    BadHeader,
    #[error("unsupported ots major version {0}")]
    UnsupportedVersion(u64),
    #[error("truncated proof")]
    Truncated,
    #[error("unsupported file-hash op-code 0x{0:02x} (only sha256 is accepted)")]
    UnsupportedFileHashOp(u8),
    #[error("unsupported op-code 0x{0:02x}")]
    UnsupportedOp(u8),
    #[error("varint too large")]
    VarintOverflow,
    #[error("proof depth exceeded ({0} levels) — refusing to recurse further")]
    ProofTooDeep(u32),
    #[error("submitted digest does not match proof's file hash")]
    DigestMismatch,
}


#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Chain {
    Bitcoin,
    Litecoin,
    Ethereum,
}

impl Chain {
    pub fn as_str(&self) -> &'static str {
        match self {
            Chain::Bitcoin => "bitcoin",
            Chain::Litecoin => "litecoin",
            Chain::Ethereum => "ethereum",
        }
    }
}


#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OtsAttestation {

    Pending { uri: String },


    BlockHeader { chain: Chain, height: u64 },


    Unknown { tag: [u8; 8], payload: Vec<u8> },
}


#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OtsOp {
    Sha1,
    Ripemd160,
    Sha256,
    Keccak256,
    Append(Vec<u8>),
    Prepend(Vec<u8>),
}

impl OtsOp {
    fn apply(&self, cur: &[u8]) -> Vec<u8> {
        match self {
            OtsOp::Sha1 => {
                let mut h = Sha1::new();
                h.update(cur);
                h.finalize().to_vec()
            }
            OtsOp::Ripemd160 => {
                let mut h = ripemd::Ripemd160::new();
                h.update(cur);
                h.finalize().to_vec()
            }
            OtsOp::Sha256 => {
                let mut h = Sha256::new();
                h.update(cur);
                h.finalize().to_vec()
            }
            OtsOp::Keccak256 => {
                use sha3::Digest as _;
                let mut h = sha3::Keccak256::new();
                h.update(cur);
                h.finalize().to_vec()
            }
            OtsOp::Append(bytes) => {
                let mut v = Vec::with_capacity(cur.len() + bytes.len());
                v.extend_from_slice(cur);
                v.extend_from_slice(bytes);
                v
            }
            OtsOp::Prepend(bytes) => {
                let mut v = Vec::with_capacity(cur.len() + bytes.len());
                v.extend_from_slice(bytes);
                v.extend_from_slice(cur);
                v
            }
        }
    }
}


#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OtsTimestamp {
    pub branches: Vec<OtsBranch>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OtsBranch {
    Attestation(OtsAttestation),
    Op(OtsOp, OtsTimestamp),
}


#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OtsProof {
    pub file_hash_op: u8,
    pub file_hash: Vec<u8>,
    pub timestamp: OtsTimestamp,
}


#[derive(Debug, Clone)]
pub struct WalkedAttestation {
    pub attestation: OtsAttestation,


    pub attested_value: Vec<u8>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtsReceipt {
    pub calendar_url: String,


    pub proof_bytes: Vec<u8>,
    pub obtained_epoch_s: u64,
}


fn read_varuint(bytes: &[u8], pos: &mut usize) -> Result<u64, OtsError> {
    let mut shift = 0u32;
    let mut acc: u64 = 0;
    loop {
        if *pos >= bytes.len() {
            return Err(OtsError::Truncated);
        }
        let b = bytes[*pos];
        *pos += 1;
        acc |= u64::from(b & 0x7f)
            .checked_shl(shift)
            .ok_or(OtsError::VarintOverflow)?;
        if b & 0x80 == 0 {
            return Ok(acc);
        }
        shift = shift.checked_add(7).ok_or(OtsError::VarintOverflow)?;
        if shift >= 64 {
            return Err(OtsError::VarintOverflow);
        }
    }
}

fn write_varuint(out: &mut Vec<u8>, mut v: u64) {
    while v > 0x7f {
        out.push(((v & 0x7f) as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

fn read_bytes<'a>(bytes: &'a [u8], pos: &mut usize, n: usize) -> Result<&'a [u8], OtsError> {
    if bytes.len() < *pos + n {
        return Err(OtsError::Truncated);
    }
    let s = &bytes[*pos..*pos + n];
    *pos += n;
    Ok(s)
}

fn read_varbytes(bytes: &[u8], pos: &mut usize) -> Result<Vec<u8>, OtsError> {
    let len = read_varuint(bytes, pos)? as usize;
    Ok(read_bytes(bytes, pos, len)?.to_vec())
}


pub fn parse_proof(bytes: &[u8]) -> Result<OtsProof, OtsError> {
    if bytes.len() < OTS_HEADER.len() || &bytes[..OTS_HEADER.len()] != OTS_HEADER {
        return Err(OtsError::BadHeader);
    }
    let mut pos = OTS_HEADER.len();

    let ver = read_varuint(bytes, &mut pos)?;
    if ver != OTS_MAJOR_VERSION {
        return Err(OtsError::UnsupportedVersion(ver));
    }

    let file_hash_op = *read_bytes(bytes, &mut pos, 1)?
        .first()
        .ok_or(OtsError::Truncated)?;


    if file_hash_op != OP_SHA256 {
        return Err(OtsError::UnsupportedFileHashOp(file_hash_op));
    }
    let file_hash = read_bytes(bytes, &mut pos, 32)?.to_vec();

    let timestamp = parse_timestamp(bytes, &mut pos, 0)?;


    Ok(OtsProof {
        file_hash_op,
        file_hash,
        timestamp,
    })
}


pub fn parse_calendar_response(bytes: &[u8]) -> Result<OtsTimestamp, OtsError> {
    let mut pos = 0;
    parse_timestamp(bytes, &mut pos, 0)
}

const MAX_PROOF_DEPTH: u32 = 256;

fn parse_timestamp(
    bytes: &[u8],
    pos: &mut usize,
    depth: u32,
) -> Result<OtsTimestamp, OtsError> {
    if depth > MAX_PROOF_DEPTH {
        return Err(OtsError::ProofTooDeep(depth));
    }

    let mut branches = Vec::new();
    loop {


        if *pos >= bytes.len() {
            return Err(OtsError::Truncated);
        }
        let more = if bytes[*pos] == TAG_FORK {
            *pos += 1;
            true
        } else {
            false
        };
        let branch = parse_branch(bytes, pos, depth)?;
        branches.push(branch);
        if !more {
            break;
        }
    }
    Ok(OtsTimestamp { branches })
}

fn parse_branch(bytes: &[u8], pos: &mut usize, depth: u32) -> Result<OtsBranch, OtsError> {
    if *pos >= bytes.len() {
        return Err(OtsError::Truncated);
    }
    let tag = bytes[*pos];
    if tag == TAG_ATTESTATION {
        *pos += 1;
        let att = parse_attestation(bytes, pos)?;
        Ok(OtsBranch::Attestation(att))
    } else {
        let op = parse_op(bytes, pos)?;
        let child = parse_timestamp(bytes, pos, depth + 1)?;
        Ok(OtsBranch::Op(op, child))
    }
}

fn parse_op(bytes: &[u8], pos: &mut usize) -> Result<OtsOp, OtsError> {
    let opcode = *read_bytes(bytes, pos, 1)?
        .first()
        .ok_or(OtsError::Truncated)?;
    Ok(match opcode {
        OP_SHA1 => OtsOp::Sha1,
        OP_RIPEMD160 => OtsOp::Ripemd160,
        OP_SHA256 => OtsOp::Sha256,
        OP_KECCAK256 => OtsOp::Keccak256,
        OP_APPEND => OtsOp::Append(read_varbytes(bytes, pos)?),
        OP_PREPEND => OtsOp::Prepend(read_varbytes(bytes, pos)?),
        other => return Err(OtsError::UnsupportedOp(other)),
    })
}

fn parse_attestation(bytes: &[u8], pos: &mut usize) -> Result<OtsAttestation, OtsError> {
    let tag: [u8; 8] = read_bytes(bytes, pos, 8)?
        .try_into()
        .map_err(|_| OtsError::Truncated)?;
    let payload = read_varbytes(bytes, pos)?;
    match tag {
        ATT_TAG_PENDING => {
            let mut p2 = 0usize;
            let uri_bytes = read_varbytes(&payload, &mut p2)?;
            let uri = String::from_utf8_lossy(&uri_bytes).into_owned();
            Ok(OtsAttestation::Pending { uri })
        }
        ATT_TAG_BITCOIN => {
            let mut p2 = 0usize;
            let height = read_varuint(&payload, &mut p2)?;
            Ok(OtsAttestation::BlockHeader {
                chain: Chain::Bitcoin,
                height,
            })
        }
        ATT_TAG_LITECOIN => {
            let mut p2 = 0usize;
            let height = read_varuint(&payload, &mut p2)?;
            Ok(OtsAttestation::BlockHeader {
                chain: Chain::Litecoin,
                height,
            })
        }
        ATT_TAG_ETHEREUM => {
            let mut p2 = 0usize;
            let height = read_varuint(&payload, &mut p2)?;
            Ok(OtsAttestation::BlockHeader {
                chain: Chain::Ethereum,
                height,
            })
        }
        _ => Ok(OtsAttestation::Unknown { tag, payload }),
    }
}


pub fn serialize_proof(digest_sha256: &[u8; 32], timestamp: &OtsTimestamp) -> Vec<u8> {
    let mut out = Vec::with_capacity(OTS_HEADER.len() + 64);
    out.extend_from_slice(OTS_HEADER);
    write_varuint(&mut out, OTS_MAJOR_VERSION);
    out.push(OP_SHA256);
    out.extend_from_slice(digest_sha256);
    serialize_timestamp(&mut out, timestamp);
    out
}

fn serialize_timestamp(out: &mut Vec<u8>, ts: &OtsTimestamp) {
    let n = ts.branches.len();
    debug_assert!(n > 0, "empty timestamp is invalid — should never construct");
    for (i, branch) in ts.branches.iter().enumerate() {
        if i + 1 < n {
            out.push(TAG_FORK);
        }
        serialize_branch(out, branch);
    }
}

fn serialize_branch(out: &mut Vec<u8>, b: &OtsBranch) {
    match b {
        OtsBranch::Attestation(a) => {
            out.push(TAG_ATTESTATION);
            serialize_attestation(out, a);
        }
        OtsBranch::Op(op, child) => {
            serialize_op(out, op);
            serialize_timestamp(out, child);
        }
    }
}

fn serialize_op(out: &mut Vec<u8>, op: &OtsOp) {
    match op {
        OtsOp::Sha1 => out.push(OP_SHA1),
        OtsOp::Ripemd160 => out.push(OP_RIPEMD160),
        OtsOp::Sha256 => out.push(OP_SHA256),
        OtsOp::Keccak256 => out.push(OP_KECCAK256),
        OtsOp::Append(b) => {
            out.push(OP_APPEND);
            write_varuint(out, b.len() as u64);
            out.extend_from_slice(b);
        }
        OtsOp::Prepend(b) => {
            out.push(OP_PREPEND);
            write_varuint(out, b.len() as u64);
            out.extend_from_slice(b);
        }
    }
}

fn serialize_attestation(out: &mut Vec<u8>, a: &OtsAttestation) {
    let (tag, payload): ([u8; 8], Vec<u8>) = match a {
        OtsAttestation::Pending { uri } => {
            let mut p = Vec::new();
            let bytes = uri.as_bytes();
            write_varuint(&mut p, bytes.len() as u64);
            p.extend_from_slice(bytes);
            (ATT_TAG_PENDING, p)
        }
        OtsAttestation::BlockHeader { chain, height } => {
            let tag = match chain {
                Chain::Bitcoin => ATT_TAG_BITCOIN,
                Chain::Litecoin => ATT_TAG_LITECOIN,
                Chain::Ethereum => ATT_TAG_ETHEREUM,
            };
            let mut p = Vec::new();
            write_varuint(&mut p, *height);
            (tag, p)
        }
        OtsAttestation::Unknown { tag, payload } => (*tag, payload.clone()),
    };
    out.extend_from_slice(&tag);
    write_varuint(out, payload.len() as u64);
    out.extend_from_slice(&payload);
}


pub fn walk(initial: &[u8], timestamp: &OtsTimestamp) -> Vec<WalkedAttestation> {
    let mut out = Vec::new();
    walk_inner(initial, timestamp, &mut out);
    out
}

fn walk_inner(cur: &[u8], ts: &OtsTimestamp, out: &mut Vec<WalkedAttestation>) {
    for branch in &ts.branches {
        match branch {
            OtsBranch::Attestation(a) => out.push(WalkedAttestation {
                attestation: a.clone(),
                attested_value: cur.to_vec(),
            }),
            OtsBranch::Op(op, child) => {
                let next = op.apply(cur);
                walk_inner(&next, child, out);
            }
        }
    }
}


#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OtsBlockVerification {

    Verified {
        chain: Chain,
        height: u64,
        block_time_epoch_s: Option<u64>,
    },


    MerkleMismatch { chain: Chain, height: u64 },

    OracleError {
        chain: Chain,
        height: u64,
        error: String,
    },
}

#[derive(Debug, Clone)]
pub struct OtsStatus {


    pub block_attestations: Vec<OtsBlockVerification>,


    pub pending_calendars: Vec<String>,


    pub unknown_attestations: usize,
}

impl OtsStatus {

    pub fn any_verified(&self) -> bool {
        self.block_attestations
            .iter()
            .any(|b| matches!(b, OtsBlockVerification::Verified { .. }))
    }


    pub fn pending_only(&self) -> bool {
        self.block_attestations.is_empty() && !self.pending_calendars.is_empty()
    }
}


pub trait BlockHeaderOracle {


    fn merkle_root(
        &self,
        chain: Chain,
        height: u64,
    ) -> Result<(Vec<u8>, Option<u64>), String>;
}


pub fn verify_ots(
    proof: &OtsProof,
    digest: &[u8; 32],
    oracle: &dyn BlockHeaderOracle,
) -> Result<OtsStatus, OtsError> {
    if proof.file_hash.as_slice() != digest.as_slice() {
        return Err(OtsError::DigestMismatch);
    }

    let walked = walk(digest, &proof.timestamp);

    let mut block_attestations = Vec::new();
    let mut pending_calendars = Vec::new();
    let mut unknown_attestations = 0usize;

    for w in walked {
        match w.attestation {
            OtsAttestation::Pending { uri } => pending_calendars.push(uri),
            OtsAttestation::BlockHeader { chain, height } => {
                let verdict = match oracle.merkle_root(chain, height) {
                    Ok((root, block_time)) => {


                        if root == w.attested_value {
                            OtsBlockVerification::Verified {
                                chain,
                                height,
                                block_time_epoch_s: block_time,
                            }
                        } else {
                            OtsBlockVerification::MerkleMismatch { chain, height }
                        }
                    }
                    Err(e) => OtsBlockVerification::OracleError {
                        chain,
                        height,
                        error: e,
                    },
                };
                block_attestations.push(verdict);
            }
            OtsAttestation::Unknown { .. } => unknown_attestations += 1,
        }
    }

    Ok(OtsStatus {
        block_attestations,
        pending_calendars,
        unknown_attestations,
    })
}


pub fn submit_ots(calendar_url: &str, digest_sha256: &[u8; 32]) -> Result<OtsReceipt, OtsError> {


    let mut last_err: Option<OtsError> = None;
    for attempt in 0..2 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        match do_submit(calendar_url, digest_sha256) {
            Ok(receipt) => return Ok(receipt),
            Err(e) => {
                let retryable = matches!(e, OtsError::Timeout);
                last_err = Some(e);
                if !retryable {
                    break;
                }
            }
        }
    }
    Err(last_err.unwrap_or(OtsError::Timeout))
}

fn do_submit(calendar_url: &str, digest_sha256: &[u8; 32]) -> Result<OtsReceipt, OtsError> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(30))
        .build();

    let url = format!("{}/digest", calendar_url.trim_end_matches('/'));
    let resp = agent
        .post(&url)
        .set("Content-Type", "application/octet-stream")
        .set("Accept", "application/octet-stream")
        .send_bytes(digest_sha256)
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => OtsError::Http(format!("HTTP {code}")),
            ureq::Error::Transport(t) => {
                if t.kind() == ureq::ErrorKind::Io {
                    OtsError::Timeout
                } else {
                    OtsError::Http(t.to_string())
                }
            }
        })?;

    let mut ts_bytes = Vec::with_capacity(4096);
    resp.into_reader()
        .take(1 << 20)
        .read_to_end(&mut ts_bytes)
        .map_err(|e| OtsError::Http(e.to_string()))?;

    let ts = parse_calendar_response(&ts_bytes)?;
    let full = serialize_proof(digest_sha256, &ts);

    let obtained_epoch_s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(OtsReceipt {
        calendar_url: calendar_url.to_string(),
        proof_bytes: full,
        obtained_epoch_s,
    })
}


pub struct EsploraOracle {
    pub bitcoin_base_url: String,
}

impl Default for EsploraOracle {
    fn default() -> Self {
        Self {
            bitcoin_base_url: "https://blockstream.info/api".to_string(),
        }
    }
}

impl BlockHeaderOracle for EsploraOracle {
    fn merkle_root(
        &self,
        chain: Chain,
        height: u64,
    ) -> Result<(Vec<u8>, Option<u64>), String> {


        if chain != Chain::Bitcoin {
            return Err(format!(
                "{} block-header lookup not wired (proof archived; verify externally)",
                chain.as_str()
            ));
        }
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(20))
            .build();


        let hash_url = format!("{}/block-height/{}", self.bitcoin_base_url, height);
        let hash_hex = agent
            .get(&hash_url)
            .call()
            .map_err(|e| e.to_string())?
            .into_string()
            .map_err(|e| e.to_string())?;
        let hash_hex = hash_hex.trim();


        let block_url = format!("{}/block/{}", self.bitcoin_base_url, hash_hex);
        let raw = agent
            .get(&block_url)
            .call()
            .map_err(|e| e.to_string())?
            .into_string()
            .map_err(|e| e.to_string())?;
        let (mroot_be_hex, ts) = parse_esplora_block_json(&raw)?;


        let mut mroot = hex_decode(&mroot_be_hex)?;
        mroot.reverse();
        Ok((mroot, ts))
    }
}

fn parse_esplora_block_json(raw: &str) -> Result<(String, Option<u64>), String> {


    let mroot = extract_json_string(raw, "merkle_root")
        .ok_or_else(|| "esplora response missing merkle_root".to_string())?;
    let ts = extract_json_number(raw, "timestamp");
    Ok((mroot, ts))
}

fn extract_json_string(raw: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let start = raw.find(&needle)? + needle.len();
    let after_colon = raw[start..].find(':')? + 1;
    let rest = &raw[start + after_colon..];
    let q_open = rest.find('"')? + 1;
    let q_close = rest[q_open..].find('"')?;
    Some(rest[q_open..q_open + q_close].to_string())
}

fn extract_json_number(raw: &str, key: &str) -> Option<u64> {
    let needle = format!("\"{key}\"");
    let start = raw.find(&needle)? + needle.len();
    let after_colon = raw[start..].find(':')? + 1;
    let rest = raw[start + after_colon..].trim_start();
    let end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    rest[..end].parse::<u64>().ok()
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("bad hex length".into());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    for i in (0..s.len()).step_by(2) {
        let b = u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string())?;
        out.push(b);
    }
    Ok(out)
}


#[cfg(test)]
mod tests {
    use super::*;

    fn make_pending_timestamp(uri: &str) -> OtsTimestamp {
        OtsTimestamp {
            branches: vec![OtsBranch::Attestation(OtsAttestation::Pending {
                uri: uri.into(),
            })],
        }
    }

    #[test]
    fn varuint_roundtrip() {
        for v in [0u64, 1, 127, 128, 300, 1_000_000, u64::MAX / 4] {
            let mut out = Vec::new();
            write_varuint(&mut out, v);
            let mut p = 0;
            let back = read_varuint(&out, &mut p).unwrap();
            assert_eq!(back, v);
            assert_eq!(p, out.len());
        }
    }

    #[test]
    fn empty_proof_bytes_rejected() {
        assert!(matches!(parse_proof(&[]), Err(OtsError::BadHeader)));
    }

    #[test]
    fn header_mismatch_rejected() {
        let bytes = vec![0u8; OTS_HEADER.len()];
        assert!(matches!(parse_proof(&bytes), Err(OtsError::BadHeader)));
    }

    #[test]
    fn wrong_file_hash_op_rejected() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(OTS_HEADER);
        write_varuint(&mut bytes, 1);
        bytes.push(0x99);
        bytes.extend_from_slice(&[0u8; 32]);
        assert!(matches!(
            parse_proof(&bytes),
            Err(OtsError::UnsupportedFileHashOp(0x99))
        ));
    }

    #[test]
    fn single_pending_attestation_roundtrip() {
        let digest = [7u8; 32];
        let ts = make_pending_timestamp("https://alice.btc.calendar.opentimestamps.org");
        let bytes = serialize_proof(&digest, &ts);
        let back = parse_proof(&bytes).unwrap();
        assert_eq!(back.file_hash_op, OP_SHA256);
        assert_eq!(back.file_hash, digest);
        assert_eq!(back.timestamp, ts);
    }

    #[test]
    fn bitcoin_attestation_roundtrip() {
        let digest = [3u8; 32];
        let ts = OtsTimestamp {
            branches: vec![OtsBranch::Op(
                OtsOp::Sha256,
                OtsTimestamp {
                    branches: vec![OtsBranch::Attestation(OtsAttestation::BlockHeader {
                        chain: Chain::Bitcoin,
                        height: 820_432,
                    })],
                },
            )],
        };
        let bytes = serialize_proof(&digest, &ts);
        let back = parse_proof(&bytes).unwrap();
        assert_eq!(back.timestamp, ts);
    }

    #[test]
    fn multi_branch_fork() {
        let digest = [1u8; 32];
        let ts = OtsTimestamp {
            branches: vec![
                OtsBranch::Attestation(OtsAttestation::Pending {
                    uri: "https://a.example".into(),
                }),
                OtsBranch::Attestation(OtsAttestation::Pending {
                    uri: "https://b.example".into(),
                }),
                OtsBranch::Op(
                    OtsOp::Sha256,
                    OtsTimestamp {
                        branches: vec![OtsBranch::Attestation(OtsAttestation::BlockHeader {
                            chain: Chain::Bitcoin,
                            height: 42,
                        })],
                    },
                ),
            ],
        };
        let bytes = serialize_proof(&digest, &ts);
        let back = parse_proof(&bytes).unwrap();
        assert_eq!(back.timestamp, ts);
    }

    #[test]
    fn walk_pending_only() {
        let digest = [9u8; 32];
        let ts = make_pending_timestamp("https://c.example");
        let out = walk(&digest, &ts);
        assert_eq!(out.len(), 1);
        assert!(matches!(out[0].attestation, OtsAttestation::Pending { .. }));
        assert_eq!(out[0].attested_value, digest.to_vec());
    }

    #[test]
    fn walk_applies_sha256_before_attestation() {
        let digest = [0xabu8; 32];
        let mut sha = Sha256::new();
        sha.update(digest);
        let expected: Vec<u8> = sha.finalize().to_vec();

        let ts = OtsTimestamp {
            branches: vec![OtsBranch::Op(
                OtsOp::Sha256,
                OtsTimestamp {
                    branches: vec![OtsBranch::Attestation(OtsAttestation::BlockHeader {
                        chain: Chain::Bitcoin,
                        height: 500_000,
                    })],
                },
            )],
        };
        let out = walk(&digest, &ts);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].attested_value, expected);
    }

    #[test]
    fn walk_append_prepend() {
        let ts = OtsTimestamp {
            branches: vec![OtsBranch::Op(
                OtsOp::Append(vec![b'B']),
                OtsTimestamp {
                    branches: vec![OtsBranch::Op(
                        OtsOp::Prepend(vec![b'X']),
                        OtsTimestamp {
                            branches: vec![OtsBranch::Attestation(OtsAttestation::Pending {
                                uri: "u".into(),
                            })],
                        },
                    )],
                },
            )],
        };
        let out = walk(b"A", &ts);
        assert_eq!(out[0].attested_value, b"XAB");
    }

    struct MockOracle {

        entries: Vec<(Chain, u64, Vec<u8>, Option<u64>)>,
    }

    impl BlockHeaderOracle for MockOracle {
        fn merkle_root(
            &self,
            chain: Chain,
            height: u64,
        ) -> Result<(Vec<u8>, Option<u64>), String> {
            self.entries
                .iter()
                .find(|e| e.0 == chain && e.1 == height)
                .map(|e| (e.2.clone(), e.3))
                .ok_or_else(|| "not found".into())
        }
    }

    #[test]
    fn verify_ots_bitcoin_ok() {
        let digest = [5u8; 32];
        let mut sha = Sha256::new();
        sha.update(digest);
        let expected: Vec<u8> = sha.finalize().to_vec();

        let ts = OtsTimestamp {
            branches: vec![OtsBranch::Op(
                OtsOp::Sha256,
                OtsTimestamp {
                    branches: vec![OtsBranch::Attestation(OtsAttestation::BlockHeader {
                        chain: Chain::Bitcoin,
                        height: 820_432,
                    })],
                },
            )],
        };
        let proof = OtsProof {
            file_hash_op: OP_SHA256,
            file_hash: digest.to_vec(),
            timestamp: ts,
        };

        let oracle = MockOracle {
            entries: vec![(Chain::Bitcoin, 820_432, expected.clone(), Some(1_700_000_000))],
        };
        let status = verify_ots(&proof, &digest, &oracle).unwrap();
        assert_eq!(status.block_attestations.len(), 1);
        assert!(status.any_verified());
        assert!(!status.pending_only());
    }

    #[test]
    fn verify_ots_pending_only() {
        let digest = [1u8; 32];
        let ts = make_pending_timestamp("https://alice.calendar/");
        let proof = OtsProof {
            file_hash_op: OP_SHA256,
            file_hash: digest.to_vec(),
            timestamp: ts,
        };
        let oracle = MockOracle { entries: vec![] };
        let status = verify_ots(&proof, &digest, &oracle).unwrap();
        assert!(status.pending_only());
        assert!(!status.any_verified());
        assert_eq!(status.pending_calendars.len(), 1);
    }

    #[test]
    fn verify_ots_merkle_mismatch() {
        let digest = [5u8; 32];
        let ts = OtsTimestamp {
            branches: vec![OtsBranch::Attestation(OtsAttestation::BlockHeader {
                chain: Chain::Bitcoin,
                height: 100,
            })],
        };
        let proof = OtsProof {
            file_hash_op: OP_SHA256,
            file_hash: digest.to_vec(),
            timestamp: ts,
        };
        let oracle = MockOracle {
            entries: vec![(Chain::Bitcoin, 100, vec![0xaa; 32], Some(1))],
        };
        let status = verify_ots(&proof, &digest, &oracle).unwrap();
        assert!(!status.any_verified());
        assert!(matches!(
            status.block_attestations[0],
            OtsBlockVerification::MerkleMismatch { .. }
        ));
    }

    #[test]
    fn verify_rejects_digest_mismatch() {
        let ts = make_pending_timestamp("x");
        let proof = OtsProof {
            file_hash_op: OP_SHA256,
            file_hash: vec![7u8; 32],
            timestamp: ts,
        };
        let oracle = MockOracle { entries: vec![] };
        assert!(matches!(
            verify_ots(&proof, &[8u8; 32], &oracle),
            Err(OtsError::DigestMismatch)
        ));
    }

    #[test]
    fn hex_decode_ok_and_bad() {
        assert_eq!(hex_decode("00ff").unwrap(), vec![0, 0xff]);
        assert!(hex_decode("0").is_err());
        assert!(hex_decode("zz").is_err());
    }

    #[test]
    fn extract_json_helpers() {
        let raw = r#"{"merkle_root":"deadbeef","timestamp":1700000000,"other":"x"}"#;
        let (mroot, ts) = parse_esplora_block_json(raw).unwrap();
        assert_eq!(mroot, "deadbeef");
        assert_eq!(ts, Some(1_700_000_000));
    }
}
