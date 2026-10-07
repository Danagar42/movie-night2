const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
}

function generateIconPNG(size) {
    // Generate RGBA buffer with brand palette:
    // Dark romantic slate background #0f172a, rounded card effect,
    // and a glowing romantic heart + cinema star in gradient (pink #ec4899 to gold #f59e0b)
    const rawScanlines = Buffer.alloc(size * (1 + size * 4));
    
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.46;
    const cornerRadius = size * 0.22; // rounded square icon

    for (let y = 0; y < size; y++) {
        const rowOffset = y * (1 + size * 4);
        rawScanlines[rowOffset] = 0; // Filter type 0: None

        for (let x = 0; x < size; x++) {
            const pixelOffset = rowOffset + 1 + x * 4;

            // Rounded rectangle mask for app icon
            const dx = Math.max(0, Math.abs(x - cx) - (cx - cornerRadius));
            const dy = Math.max(0, Math.abs(y - cy) - (cy - cornerRadius));
            const distFromCorner = Math.sqrt(dx * dx + dy * dy);
            
            if (distFromCorner > cornerRadius) {
                // Transparent outside rounded icon
                rawScanlines[pixelOffset] = 0;
                rawScanlines[pixelOffset + 1] = 0;
                rawScanlines[pixelOffset + 2] = 0;
                rawScanlines[pixelOffset + 3] = 0;
                continue;
            }

            // Background base: dark slate #0f172a with subtle radial gradient to #1e293b
            const distFromCenter = Math.hypot(x - cx, y - cy) / (size * 0.7);
            let bgR = Math.round(15 + 15 * (1 - Math.min(1, distFromCenter)));
            let bgG = Math.round(23 + 18 * (1 - Math.min(1, distFromCenter)));
            let bgB = Math.round(42 + 25 * (1 - Math.min(1, distFromCenter)));

            // Mathematical heart: (x^2 + y^2 - 1)^3 - x^2 * y^3 <= 0
            // Normalized coordinates:
            const hx = (x - cx) / (size * 0.28);
            const hy = -(y - (cy + size * 0.04)) / (size * 0.28); // inverted Y, slightly shifted down

            const a = hx * hx + hy * hy - 1;
            const heartVal = a * a * a - hx * hx * hy * hy * hy;

            let r = bgR;
            let g = bgG;
            let b = bgB;
            let alpha = 255;

            // Heart glow
            if (heartVal > 0 && heartVal < 0.35) {
                const glow = 1 - (heartVal / 0.35);
                r = Math.min(255, Math.round(r + 180 * glow * 0.4));
                g = Math.min(255, Math.round(g + 60 * glow * 0.2));
                b = Math.min(255, Math.round(b + 120 * glow * 0.3));
            }

            if (heartVal <= 0) {
                // Inside heart: Gradient from deep rose (#f43f5e) at top to gold (#fbbf24) at bottom
                const t = Math.max(0, Math.min(1, (hy + 1.2) / 2.4));
                // Top: rose pink (244, 63, 94), Bottom: warm gold (251, 191, 36)
                const hr = Math.round(251 * (1 - t) + 244 * t);
                const hg = Math.round(191 * (1 - t) + 63 * t);
                const hb = Math.round(36 * (1 - t) + 110 * t);

                // Heart border antialiasing
                if (heartVal > -0.08) {
                    const edgeBlend = (-heartVal) / 0.08;
                    r = Math.round(r * (1 - edgeBlend) + hr * edgeBlend);
                    g = Math.round(g * (1 - edgeBlend) + hg * edgeBlend);
                    b = Math.round(b * (1 - edgeBlend) + hb * edgeBlend);
                } else {
                    r = hr;
                    g = hg;
                    b = hb;
                }
            }

            // Cinema Sparkle star in upper right of heart
            const sx = (x - (cx + size * 0.22)) / (size * 0.08);
            const sy = (y - (cy - size * 0.24)) / (size * 0.08);
            const starDist = Math.abs(sx * sy) + 0.3 * Math.hypot(sx, sy);
            if (starDist < 0.25) {
                const sIntensity = 1 - (starDist / 0.25);
                r = Math.min(255, Math.round(r + 255 * sIntensity));
                g = Math.min(255, Math.round(g + 245 * sIntensity));
                b = Math.min(255, Math.round(b + 180 * sIntensity));
            }

            rawScanlines[pixelOffset] = r;
            rawScanlines[pixelOffset + 1] = g;
            rawScanlines[pixelOffset + 2] = b;
            rawScanlines[pixelOffset + 3] = alpha;
        }
    }

    // 1. Signature
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // 2. IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // 8 bit depth
    ihdr[9] = 6; // RGBA color type
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    const ihdrChunk = makeChunk('IHDR', ihdr);

    // 3. IDAT
    const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
    const idatChunk = makeChunk('IDAT', compressed);

    // 4. IEND
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.resolve(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

const SIZES = [180, 192, 512];
SIZES.forEach(size => {
    const pngBuf = generateIconPNG(size);
    const dest = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(dest, pngBuf);
    console.log(`Generated ${dest} (${size}x${size}, ${pngBuf.length} bytes)`);
});
