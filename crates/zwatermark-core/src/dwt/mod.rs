

use ndarray::{s, Array2};


#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Family {
    Haar,
}


#[derive(Debug, Clone)]
pub struct SubBands {
    pub ll: Array2<f32>,
    pub hl: Array2<f32>,
    pub lh: Array2<f32>,
    pub hh: Array2<f32>,
}

impl SubBands {
    pub fn shape(&self) -> (usize, usize) {
        self.ll.dim()
    }
}


pub fn forward(channel: &Array2<f32>, _family: Family) -> SubBands {
    let (h, w) = channel.dim();
    assert!(h % 2 == 0 && w % 2 == 0, "DWT dimensions must be even");


    let mut rows = Array2::<f32>::zeros((h, w));
    let inv_sqrt2 = std::f32::consts::FRAC_1_SQRT_2;
    for y in 0..h {
        for x in 0..w / 2 {
            let a = channel[[y, 2 * x]];
            let b = channel[[y, 2 * x + 1]];
            rows[[y, x]] = (a + b) * inv_sqrt2;
            rows[[y, w / 2 + x]] = (a - b) * inv_sqrt2;
        }
    }


    let mut ll = Array2::<f32>::zeros((h / 2, w / 2));
    let mut hl = Array2::<f32>::zeros((h / 2, w / 2));
    let mut lh = Array2::<f32>::zeros((h / 2, w / 2));
    let mut hh = Array2::<f32>::zeros((h / 2, w / 2));
    for y in 0..h / 2 {
        for x in 0..w / 2 {
            let a_l = rows[[2 * y, x]];
            let b_l = rows[[2 * y + 1, x]];
            let a_h = rows[[2 * y, w / 2 + x]];
            let b_h = rows[[2 * y + 1, w / 2 + x]];
            ll[[y, x]] = (a_l + b_l) * inv_sqrt2;
            lh[[y, x]] = (a_l - b_l) * inv_sqrt2;
            hl[[y, x]] = (a_h + b_h) * inv_sqrt2;
            hh[[y, x]] = (a_h - b_h) * inv_sqrt2;
        }
    }

    SubBands { ll, hl, lh, hh }
}


pub fn inverse(bands: &SubBands, _family: Family) -> Array2<f32> {
    let (h2, w2) = bands.ll.dim();
    let h = h2 * 2;
    let w = w2 * 2;
    let inv_sqrt2 = std::f32::consts::FRAC_1_SQRT_2;


    let mut rows = Array2::<f32>::zeros((h, w));
    for y in 0..h2 {
        for x in 0..w2 {
            let ll = bands.ll[[y, x]];
            let lh = bands.lh[[y, x]];
            let hl = bands.hl[[y, x]];
            let hh = bands.hh[[y, x]];
            rows[[2 * y, x]] = (ll + lh) * inv_sqrt2;
            rows[[2 * y + 1, x]] = (ll - lh) * inv_sqrt2;
            rows[[2 * y, w2 + x]] = (hl + hh) * inv_sqrt2;
            rows[[2 * y + 1, w2 + x]] = (hl - hh) * inv_sqrt2;
        }
    }


    let mut out = Array2::<f32>::zeros((h, w));
    for y in 0..h {
        for x in 0..w2 {
            let l = rows[[y, x]];
            let hi = rows[[y, w2 + x]];
            out[[y, 2 * x]] = (l + hi) * inv_sqrt2;
            out[[y, 2 * x + 1]] = (l - hi) * inv_sqrt2;
        }
    }
    out
}


#[derive(Debug, Clone)]
pub struct MultiLevel {


    pub level1: SubBands,

    pub level2: SubBands,
}


pub fn forward_2level(channel: &Array2<f32>, family: Family) -> MultiLevel {
    let level1 = forward(channel, family);
    let level2 = forward(&level1.ll, family);
    MultiLevel { level1, level2 }
}


pub fn inverse_2level(multi: &MultiLevel, family: Family) -> Array2<f32> {
    let new_ll1 = inverse(&multi.level2, family);
    let bands = SubBands {
        ll: new_ll1,
        hl: multi.level1.hl.clone(),
        lh: multi.level1.lh.clone(),
        hh: multi.level1.hh.clone(),
    };
    inverse(&bands, family)
}


pub fn even_crop(channel: &Array2<f32>) -> Array2<f32> {
    let (h, w) = channel.dim();
    let h2 = h - (h % 2);
    let w2 = w - (w % 2);
    channel.slice(s![..h2, ..w2]).to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::arr2;

    #[test]
    fn haar_inverse_recovers_input() {

        let x = arr2(&[
            [1.0f32, 2.0, 3.0, 4.0],
            [5.0, 6.0, 7.0, 8.0],
            [9.0, 10.0, 11.0, 12.0],
            [13.0, 14.0, 15.0, 16.0],
        ]);
        let bands = forward(&x, Family::Haar);
        let back = inverse(&bands, Family::Haar);
        for y in 0..4 {
            for xi in 0..4 {
                assert!((x[[y, xi]] - back[[y, xi]]).abs() < 1e-4);
            }
        }
    }

    #[test]
    fn haar_ll_is_average_scaled() {

        let x = arr2(&[[4.0f32, 6.0], [8.0, 10.0]]);
        let bands = forward(&x, Family::Haar);
        assert!((bands.ll[[0, 0]] - 14.0).abs() < 1e-4);
    }
}
