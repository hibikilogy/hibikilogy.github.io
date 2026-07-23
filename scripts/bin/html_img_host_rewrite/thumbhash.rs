use std::f32::consts::PI;

// ThumbHash encoding owned by the HTML image rewrite tool.

/// Encodes an RGBA image to a ThumbHash.
///
/// RGB must not be premultiplied by alpha. The input width and height must be
/// at most 100px, and `rgba` must contain `w * h * 4` bytes in row-major order.
pub fn rgba_to_thumb_hash(w: usize, h: usize, rgba: &[u8]) -> Vec<u8> {
    // Encoding an image larger than 100x100 is slow with no visible benefit.
    assert!(w <= 100 && h <= 100);
    assert_eq!(rgba.len(), w * h * 4);

    let mut avg_r = 0.0;
    let mut avg_g = 0.0;
    let mut avg_b = 0.0;
    let mut avg_a = 0.0;
    for rgba in rgba.chunks_exact(4) {
        let alpha = rgba[3] as f32 / 255.0;
        avg_r += alpha / 255.0 * rgba[0] as f32;
        avg_g += alpha / 255.0 * rgba[1] as f32;
        avg_b += alpha / 255.0 * rgba[2] as f32;
        avg_a += alpha;
    }
    if avg_a > 0.0 {
        avg_r /= avg_a;
        avg_g /= avg_a;
        avg_b /= avg_a;
    }

    let has_alpha = avg_a < (w * h) as f32;
    let l_limit = if has_alpha { 5 } else { 7 };
    let lx = (((l_limit * w) as f32 / w.max(h) as f32).round() as usize).max(1);
    let ly = (((l_limit * h) as f32 / w.max(h) as f32).round() as usize).max(1);
    let mut l = Vec::with_capacity(w * h);
    let mut p = Vec::with_capacity(w * h);
    let mut q = Vec::with_capacity(w * h);
    let mut a = Vec::with_capacity(w * h);

    for rgba in rgba.chunks_exact(4) {
        let alpha = rgba[3] as f32 / 255.0;
        let r = avg_r * (1.0 - alpha) + alpha / 255.0 * rgba[0] as f32;
        let g = avg_g * (1.0 - alpha) + alpha / 255.0 * rgba[1] as f32;
        let b = avg_b * (1.0 - alpha) + alpha / 255.0 * rgba[2] as f32;
        l.push((r + g + b) / 3.0);
        p.push((r + g) / 2.0 - b);
        q.push(r - g);
        a.push(alpha);
    }

    let encode_channel = |channel: &[f32], nx: usize, ny: usize| -> (f32, Vec<f32>, f32) {
        let mut dc = 0.0;
        let mut ac = Vec::with_capacity(nx * ny / 2);
        let mut scale: f32 = 0.0;
        let mut fx = vec![0.0; w];

        for cy in 0..ny {
            let mut cx = 0;
            while cx * ny < nx * (ny - cy) {
                let mut f = 0.0;
                for (x, fx_item) in fx.iter_mut().enumerate() {
                    *fx_item = (PI / w as f32 * cx as f32 * (x as f32 + 0.5)).cos();
                }
                for y in 0..h {
                    let fy = (PI / h as f32 * cy as f32 * (y as f32 + 0.5)).cos();
                    for x in 0..w {
                        f += channel[x + y * w] * fx[x] * fy;
                    }
                }
                f /= (w * h) as f32;
                if cx > 0 || cy > 0 {
                    ac.push(f);
                    scale = f.abs().max(scale);
                } else {
                    dc = f;
                }
                cx += 1;
            }
        }

        if scale > 0.0 {
            for ac in &mut ac {
                *ac = 0.5 + 0.5 / scale * *ac;
            }
        }
        (dc, ac, scale)
    };

    let (l_dc, l_ac, l_scale) = encode_channel(&l, lx.max(3), ly.max(3));
    let (p_dc, p_ac, p_scale) = encode_channel(&p, 3, 3);
    let (q_dc, q_ac, q_scale) = encode_channel(&q, 3, 3);
    let (a_dc, a_ac, a_scale) = if has_alpha {
        encode_channel(&a, 5, 5)
    } else {
        (1.0, Vec::new(), 1.0)
    };

    let is_landscape = w > h;
    let header24 = (63.0 * l_dc).round() as u32
        | (((31.5 + 31.5 * p_dc).round() as u32) << 6)
        | (((31.5 + 31.5 * q_dc).round() as u32) << 12)
        | (((31.0 * l_scale).round() as u32) << 18)
        | if has_alpha { 1 << 23 } else { 0 };
    let header16 = (if is_landscape { ly } else { lx }) as u16
        | (((63.0 * p_scale).round() as u16) << 3)
        | (((63.0 * q_scale).round() as u16) << 9)
        | if is_landscape { 1 << 15 } else { 0 };

    let mut hash = Vec::with_capacity(25);
    hash.extend_from_slice(&[
        (header24 & 255) as u8,
        ((header24 >> 8) & 255) as u8,
        (header24 >> 16) as u8,
        (header16 & 255) as u8,
        (header16 >> 8) as u8,
    ]);

    let mut is_odd = false;
    if has_alpha {
        hash.push((15.0 * a_dc).round() as u8 | (((15.0 * a_scale).round() as u8) << 4));
    }

    for ac in [l_ac, p_ac, q_ac] {
        for f in ac {
            let u = (15.0 * f).round() as u8;
            if is_odd {
                *hash.last_mut().unwrap() |= u << 4;
            } else {
                hash.push(u);
            }
            is_odd = !is_odd;
        }
    }
    if has_alpha {
        for f in a_ac {
            let u = (15.0 * f).round() as u8;
            if is_odd {
                *hash.last_mut().unwrap() |= u << 4;
            } else {
                hash.push(u);
            }
            is_odd = !is_odd;
        }
    }

    hash
}
