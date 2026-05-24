const PALETTE: ReadonlyArray<readonly [number, number, number, string]> = [
    [0x00, 0x00, 0x00, 'Black'],
    [0xff, 0xff, 0xff, 'White'],
    [0xf5, 0xf5, 0xdc, 'Off-White'],
    [0x80, 0x80, 0x80, 'Grey'],
    [0xc0, 0xc0, 0xc0, 'Silver'],
    [0xff, 0x00, 0x00, 'Red'],
    [0xff, 0xa5, 0x00, 'Orange'],
    [0xff, 0xff, 0x00, 'Yellow'],
    [0x80, 0xc0, 0x00, 'Lime'],
    [0x00, 0xff, 0x00, 'Green'],
    [0x00, 0x80, 0x80, 'Teal'],
    [0x00, 0xff, 0xff, 'Cyan'],
    [0x87, 0xce, 0xeb, 'Sky'],
    [0x00, 0x00, 0xff, 'Blue'],
    [0x4b, 0x00, 0x82, 'Indigo'],
    [0x8a, 0x2b, 0xe2, 'Violet'],
    [0xff, 0x00, 0xff, 'Magenta'],
    [0xff, 0xc0, 0xcb, 'Pink'],
    [0x8b, 0x45, 0x13, 'Brown'],
    [0xd2, 0xb4, 0x8c, 'Tan'],
]

export function nameForHex(hex: string): string {
    if (!hex) return 'Unknown'
    const s = hex.replace(/^#/, '')
    let r: number, g: number, b: number, a: number
    if (s.length === 8) {
        r = parseInt(s.slice(0, 2), 16)
        g = parseInt(s.slice(2, 4), 16)
        b = parseInt(s.slice(4, 6), 16)
        a = parseInt(s.slice(6, 8), 16)
    } else if (s.length === 6) {
        r = parseInt(s.slice(0, 2), 16)
        g = parseInt(s.slice(2, 4), 16)
        b = parseInt(s.slice(4, 6), 16)
        a = 0xff
    } else {
        return 'Unknown'
    }
    if (Number.isNaN(r + g + b + a)) return 'Unknown'
    if (a < 0x40) return 'Clear'
    let bestName = 'Unknown'
    let bestD = Infinity
    for (const [pr, pg, pb, name] of PALETTE) {
        const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if (d < bestD) {
            bestD = d
            bestName = name
        }
    }
    return bestName
}
