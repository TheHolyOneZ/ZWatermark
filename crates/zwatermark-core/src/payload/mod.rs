

use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;

bitflags::bitflags! {


    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct Strength: u8 {
        const ROBUST  = 0b001;
        const FRAGILE = 0b010;
        const BOOST   = 0b100;
        const BOTH    = Self::ROBUST.bits() | Self::FRAGILE.bits();
        const MAX     = Self::ROBUST.bits() | Self::FRAGILE.bits() | Self::BOOST.bits();
    }
}


#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct RobustPayload {
    pub version: u8,
    pub user_id: [u8; 5],
    pub device_id: [u8; 2],
    pub epoch_min: u32,
    pub counter: u16,
}

pub const CURRENT_VERSION: u8 = 1;

impl RobustPayload {


    pub fn to_bits(&self) -> [u8; 16] {
        debug_assert!(self.version < 16, "version overflow");
        debug_assert!(self.counter < 4096, "counter overflow");


        let mut body = [0u8; 13];
        body[0] = (self.version & 0x0F) << 4 | ((self.user_id[0] >> 4) & 0x0F);
        body[1] = (self.user_id[0] << 4) | ((self.user_id[1] >> 4) & 0x0F);
        body[2] = (self.user_id[1] << 4) | ((self.user_id[2] >> 4) & 0x0F);
        body[3] = (self.user_id[2] << 4) | ((self.user_id[3] >> 4) & 0x0F);
        body[4] = (self.user_id[3] << 4) | ((self.user_id[4] >> 4) & 0x0F);

        body[5] = (self.user_id[4] << 4) | ((self.device_id[0] >> 4) & 0x0F);
        body[6] = (self.device_id[0] << 4) | ((self.device_id[1] >> 4) & 0x0F);

        body[7] = (self.device_id[1] << 4) | ((self.epoch_min >> 28) as u8 & 0x0F);

        body[8] = ((self.epoch_min >> 20) & 0xFF) as u8;
        body[9] = ((self.epoch_min >> 12) & 0xFF) as u8;
        body[10] = ((self.epoch_min >> 4) & 0xFF) as u8;
        body[11] = ((self.epoch_min << 4) as u8 & 0xF0) | ((self.counter >> 8) as u8 & 0x0F);
        body[12] = (self.counter & 0xFF) as u8;

        let checksum = blake3::hash(&body);
        let mut out = [0u8; 16];
        out[..13].copy_from_slice(&body);
        out[13..16].copy_from_slice(&checksum.as_bytes()[..3]);
        out
    }


    pub fn from_bits(bits: &[u8; 16]) -> Option<Self> {
        let body = &bits[..13];
        let expected = &bits[13..16];
        let actual = blake3::hash(body);
        if &actual.as_bytes()[..3] != expected {
            return None;
        }

        let version = (body[0] >> 4) & 0x0F;
        let mut user_id = [0u8; 5];
        user_id[0] = ((body[0] & 0x0F) << 4) | ((body[1] >> 4) & 0x0F);
        user_id[1] = ((body[1] & 0x0F) << 4) | ((body[2] >> 4) & 0x0F);
        user_id[2] = ((body[2] & 0x0F) << 4) | ((body[3] >> 4) & 0x0F);
        user_id[3] = ((body[3] & 0x0F) << 4) | ((body[4] >> 4) & 0x0F);
        user_id[4] = ((body[4] & 0x0F) << 4) | ((body[5] >> 4) & 0x0F);
        let mut device_id = [0u8; 2];
        device_id[0] = ((body[5] & 0x0F) << 4) | ((body[6] >> 4) & 0x0F);
        device_id[1] = ((body[6] & 0x0F) << 4) | ((body[7] >> 4) & 0x0F);
        let epoch_min = ((body[7] as u32 & 0x0F) << 28)
            | ((body[8] as u32) << 20)
            | ((body[9] as u32) << 12)
            | ((body[10] as u32) << 4)
            | ((body[11] as u32 >> 4) & 0x0F);
        let counter = (((body[11] as u16) & 0x0F) << 8) | body[12] as u16;

        Some(Self {
            version,
            user_id,
            device_id,
            epoch_min,
            counter,
        })
    }
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FragilePayload {
    pub pubkey: [u8; 32],
    pub timestamp_ns: u128,
    pub screen_serial: Option<String>,
    pub region: Option<Region>,


    #[serde(default)]
    pub device_name: Option<String>,

    #[serde(with = "BigArray")]
    pub signature: [u8; 64],
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Region {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

impl FragilePayload {


    pub fn signable(&self) -> Vec<u8> {
        let mut b = Vec::with_capacity(128);
        b.extend_from_slice(b"ZWM2");
        b.extend_from_slice(&self.pubkey);
        b.extend_from_slice(&self.timestamp_ns.to_le_bytes());
        if let Some(s) = &self.screen_serial {
            b.extend_from_slice(&(s.len() as u32).to_le_bytes());
            b.extend_from_slice(s.as_bytes());
        } else {
            b.extend_from_slice(&0u32.to_le_bytes());
        }
        if let Some(r) = &self.region {
            b.push(1);
            b.extend_from_slice(&r.x.to_le_bytes());
            b.extend_from_slice(&r.y.to_le_bytes());
            b.extend_from_slice(&r.w.to_le_bytes());
            b.extend_from_slice(&r.h.to_le_bytes());
        } else {
            b.push(0);
        }
        if let Some(n) = &self.device_name {
            b.extend_from_slice(&(n.len() as u32).to_le_bytes());
            b.extend_from_slice(n.as_bytes());
        } else {
            b.extend_from_slice(&0u32.to_le_bytes());
        }
        b
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn robust_payload_roundtrip() {
        let p = RobustPayload {
            version: CURRENT_VERSION,
            user_id: [0x12, 0x34, 0x56, 0x78, 0x9A],
            device_id: [0xBC, 0xDE],
            epoch_min: 29_040_000,
            counter: 4093,
        };
        let bits = p.to_bits();
        let back = RobustPayload::from_bits(&bits).expect("decode");
        assert_eq!(p, back);
    }

    #[test]
    fn robust_payload_detects_flips() {
        let p = RobustPayload {
            version: CURRENT_VERSION,
            user_id: [1, 2, 3, 4, 5],
            device_id: [6, 7],
            epoch_min: 12345,
            counter: 1,
        };
        let mut bits = p.to_bits();
        bits[3] ^= 0x01;
        assert!(RobustPayload::from_bits(&bits).is_none());
    }
}
