"""
Меняет одну картинку внутри уже готового .glb, не трогая ничего остального
(меши, материалы, все анимации) — то есть можно поменять текстуру, даже
если .blend потерян или импорт в Blender роняет часть анимаций.

Использование:
    python3 swap_glb_texture.py <исходный.glb> <новая_картинка.png> <имя_картинки_в_glb> <результат.glb>

Пример (то, что уже сделано для тебя один раз):
    python3 swap_glb_texture.py \
        "badge tamplete/public/models/EMMISION_BADGE4.glb" \
        "txtrs/full.png" \
        "Ucupaint Anisotropic Brushed Metal" \
        "badge tamplete/public/models/EMMISION_BADGE5.glb"

Если новая картинка меньше по разрешению, чем текстура внутри модели —
скрипт сам увеличит её (Lanczos) до нужного размера, чтобы UV-развёртка
не съехала. Если больше — тоже подгонит под нужный размер.
"""
import sys
import struct
import json
import io
from pathlib import Path
from PIL import Image


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF', f"{path} — не glb файл"
    off = 12
    chunks = []
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off)
        off += 8
        chunks.append([ctype, bytearray(data[off:off + clen])])
        off += clen
    return chunks


def write_glb(chunks, path):
    body = b''
    for ctype, cdata in chunks:
        cdata = bytes(cdata)
        pad = (4 - (len(cdata) % 4)) % 4
        if pad:
            padchar = b' ' if ctype == b'JSON' else b'\x00'
            cdata += padchar * pad
        body += struct.pack('<I4s', len(cdata), ctype) + cdata
    header = struct.pack('<4sII', b'glTF', 2, 12 + len(body))
    with open(path, 'wb') as f:
        f.write(header + body)


def replace_image(glb_path, out_path, image_name, new_png_bytes):
    chunks = read_glb(glb_path)
    json_idx = next(i for i, (t, d) in enumerate(chunks) if t == b'JSON')
    bin_idx = next(i for i, (t, d) in enumerate(chunks) if t == b'BIN\x00')
    gltf = json.loads(bytes(chunks[json_idx][1]))
    bin_data = bytes(chunks[bin_idx][1])

    matches = [im for im in gltf['images'] if im.get('name') == image_name]
    if not matches:
        names = [im.get('name') for im in gltf['images']]
        raise SystemExit(f"Картинка с именем '{image_name}' не найдена. Есть: {names}")
    img_entry = matches[0]

    bv_idx = img_entry['bufferView']
    bvs = gltf['bufferViews']
    old_bv = bvs[bv_idx]
    old_off = old_bv.get('byteOffset', 0)
    old_len = old_bv['byteLength']

    # паддинг, чтобы сдвиг остался кратен 4 — тогда все последующие
    # bufferView (в т.ч. используемые анимациями/мешами) останутся
    # выровнены ровно так же, как были
    extra = (-(len(new_png_bytes) - old_len)) % 4
    new_bytes = new_png_bytes + b'\x00' * extra
    delta = len(new_bytes) - old_len

    new_bin = bin_data[:old_off] + new_bytes + bin_data[old_off + old_len:]

    old_bv['byteLength'] = len(new_bytes)
    for bv in bvs:
        off = bv.get('byteOffset', 0)
        if off > old_off:
            bv['byteOffset'] = off + delta

    gltf['buffers'][0]['byteLength'] = len(new_bin)
    img_entry['mimeType'] = 'image/png'

    chunks[json_idx][1] = bytearray(json.dumps(gltf).encode('utf-8'))
    chunks[bin_idx][1] = bytearray(new_bin)
    write_glb(chunks, out_path)
    return gltf


def get_image_size(glb_path, image_name):
    chunks = read_glb(glb_path)
    gltf = json.loads(bytes(next(d for t, d in chunks if t == b'JSON')))
    bin_data = bytes(next(d for t, d in chunks if t == b'BIN\x00'))
    img_entry = next(im for im in gltf['images'] if im.get('name') == image_name)
    bv = gltf['bufferViews'][img_entry['bufferView']]
    off, ln = bv.get('byteOffset', 0), bv['byteLength']
    return Image.open(io.BytesIO(bin_data[off:off + ln])).size


def main():
    if len(sys.argv) != 5:
        print(__doc__)
        raise SystemExit(1)
    src_glb, new_png, image_name, out_glb = sys.argv[1:5]

    target_size = get_image_size(src_glb, image_name)
    new_img = Image.open(new_png).convert('RGBA')
    if new_img.size != target_size:
        print(f"Масштабирую {new_png} {new_img.size} -> {target_size} (Lanczos)")
        new_img = new_img.resize(target_size, Image.LANCZOS)

    buf = io.BytesIO()
    new_img.save(buf, format='PNG')

    gltf = replace_image(src_glb, out_glb, image_name, buf.getvalue())
    print(f"Готово: {out_glb}")
    print(f"  анимаций: {len(gltf.get('animations', []))} (должно совпадать с исходником)")
    print(f"  картинок: {[im.get('name') for im in gltf['images']]}")


if __name__ == '__main__':
    main()
