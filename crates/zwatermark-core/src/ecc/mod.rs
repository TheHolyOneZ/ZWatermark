

pub const REPETITION: usize = 3;


pub fn repeat_encode(payload_bits: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload_bits.len() * REPETITION);
    for _ in 0..REPETITION {
        out.extend_from_slice(payload_bits);
    }
    out
}


pub fn repeat_decode(stream: &[u8], payload_bits: usize) -> Vec<u8> {
    let mut votes = vec![0i32; payload_bits];
    for chunk in stream.chunks_exact(payload_bits) {
        for (i, &b) in chunk.iter().enumerate() {
            votes[i] += if b >= 1 { 1 } else { -1 };
        }
    }
    votes
        .into_iter()
        .map(|v| if v >= 0 { 1u8 } else { 0u8 })
        .collect()
}


pub fn bytes_to_bits(bytes: &[u8]) -> Vec<u8> {
    let mut bits = Vec::with_capacity(bytes.len() * 8);
    for &b in bytes {
        for i in (0..8).rev() {
            bits.push((b >> i) & 1);
        }
    }
    bits
}


pub fn bits_to_bytes(bits: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(bits.len() / 8);
    for chunk in bits.chunks_exact(8) {
        let mut b = 0u8;
        for (i, &bit) in chunk.iter().enumerate() {
            b |= (bit & 1) << (7 - i);
        }
        bytes.push(b);
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repetition_roundtrip() {
        let bits = vec![1u8, 0, 1, 1, 0, 0, 1, 0];
        let stream = repeat_encode(&bits);
        assert_eq!(stream.len(), bits.len() * REPETITION);
        let back = repeat_decode(&stream, bits.len());
        assert_eq!(bits, back);
    }

    #[test]
    fn repetition_survives_single_flip() {
        let bits = vec![1u8, 0, 1, 1, 0, 0, 1, 0];
        let mut stream = repeat_encode(&bits);
        stream[3] ^= 1;
        let back = repeat_decode(&stream, bits.len());
        assert_eq!(bits, back);
    }

    #[test]
    fn bits_bytes_roundtrip() {
        let bytes = vec![0xAB, 0xCD, 0xEF];
        let bits = bytes_to_bits(&bytes);
        assert_eq!(bits.len(), 24);
        assert_eq!(bits_to_bytes(&bits), bytes);
    }
}
