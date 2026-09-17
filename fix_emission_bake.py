"""
Чиним материалы с "маскированной" эмиссией, чтобы они правильно
экспортировались в glTF.

ПОЧЕМУ ТАК ПРОИСХОДИТ
----------------------
В glTF на материал можно повесить только ОДНУ карту для Emission Color
(+ одно число Strength через KHR_materials_emissive_strength). Если маска
(ColorRamp от альфы текстуры) управляет входом Strength у Principled BSDF,
а Emission Color остаётся плоским цветом (свотч) — экспортёр Blender не
умеет протащить процедурный граф через Strength. В итоге он берёт плоский
цвет свотча и клеит его как emissiveFactor на весь объект целиком — именно
это видно на скрине экспортированного glb (вся деталь светится розовым).

ЧТО ДЕЛАЕТ СКРИПТ
------------------
Находит такую цепочку, запекает результат (маска * цвет свотча) в новую
плоскую PNG-текстуру и подключает её НАПРЯМУЮ к Emission Color, оставляя
Strength обычным числом. Именно связку "картинка -> Emission Color,
число -> Strength" экспортёр Blender умеет превращать в
emissiveTexture + emissiveFactor + KHR_materials_emissive_strength.

КАК ПОЛЬЗОВАТЬСЯ
------------------
1. Открой .blend в Blender -> вкладка Scripting.
2. Вставь этот скрипт целиком, при необходимости поправь OBJECT_NAMES.
3. Сначала прогони с DRY_RUN = True (стоит по умолчанию) — скрипт ничего
   не меняет, только печатает в консоли, что нашёл (материал, картинку-
   маску, текущий цвет свечения). Сверь с ожиданиями.
4. Если всё совпадает — поставь DRY_RUN = False и запусти ещё раз.
   Скрипт запечёт текстуру, переключит материал на неё и сохранит
   результат в НОВЫЙ .blend файл (оригинал не трогает).
5. Открой новый .blend, глазами проверь во viewport, экспортируй glTF
   и проверь превью (например в https://gltf.report или в самом Blender
   через File > Import > glTF в новый файл).
6. Когда убедишься, что всё ок — можно перенести изменения в основной
   файл (или просто продолжать работать в новом).
"""

import bpy
from pathlib import Path

# ---- настройки ----
OBJECT_NAMES = ["Extruded.044"]   # какие объекты обработать (можно перечислить несколько)
DRY_RUN = True                     # True = только показать, что нашли, ничего не менять
OUT_BLEND = Path("/Users/vasa/Documents/projects work/3divanbadge/ivan3dbackup_emission_fixed.blend")
TEXTURE_OUT_DIR = Path("/Users/vasa/Documents/projects work/3divanbadge/txtrs")
BAKE_MARGIN = 4


def find_principled(node_tree):
    for n in node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            yield n


def upstream(socket):
    return socket.links[0].from_node if socket.is_linked else None


def find_colorramp_and_source(node, visited=None):
    """Идём вверх по графу от ноды (обычно Math/Multiply) и ищём ColorRamp,
    у которого Fac запитан от текстуры. Возвращает (colorramp_node, tex_node, socket_name)."""
    if visited is None:
        visited = set()
    if node is None or node in visited:
        return None
    visited.add(node)
    if node.type == 'VALTORGB':  # Color Ramp
        fac_input = node.inputs['Fac']
        if fac_input.is_linked:
            fac_link = fac_input.links[0]
            fac_node = fac_link.from_node
            if fac_node.type == 'TEX_IMAGE':
                return node, fac_node, fac_link.from_socket.name
        return node, None, None
    for inp in node.inputs:
        if inp.is_linked:
            result = find_colorramp_and_source(upstream(inp), visited)
            if result:
                return result
    return None


def make_multiply_mix(nt):
    """Создаёт ноду 'умножение двух цветов', пытаясь по очереди совместимые типы."""
    try:
        node = nt.nodes.new('ShaderNodeMixRGB')
        node.blend_type = 'MULTIPLY'
        node.inputs['Fac'].default_value = 1.0
        return node, 'Color1', 'Color2', 'Color'
    except RuntimeError:
        node = nt.nodes.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        node.blend_type = 'MULTIPLY'
        node.inputs['Factor'].default_value = 1.0
        return node, 'A', 'B', 'Result'


def process_object(obj_name):
    obj = bpy.data.objects.get(obj_name)
    if obj is None:
        print(f"[!] объект '{obj_name}' не найден в текущей сцене")
        return
    if not hasattr(obj.data, 'materials'):
        print(f"[!] у '{obj_name}' нет материалов")
        return

    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        nt = mat.node_tree
        for principled in find_principled(nt):
            strength_input = principled.inputs.get('Emission Strength')
            color_input = principled.inputs.get('Emission Color')
            if strength_input is None or color_input is None:
                continue
            if not strength_input.is_linked:
                continue  # обычный плоский Strength — не наш случай

            found = find_colorramp_and_source(upstream(strength_input))
            print(f"--- {obj.name} / материал '{mat.name}' ---")
            if not found:
                print("  [?] Strength подключен к нодам, но ColorRamp с маской-текстурой не нашёл")
                print("      -> обработай этот материал вручную")
                continue

            colorramp_node, source_tex_node, source_socket = found
            img_name = source_tex_node.image.name if (source_tex_node and source_tex_node.image) else None

            print(f"  Strength запитан цепочкой от '{colorramp_node.name}'"
                  + (f" <- изображение '{img_name}' ({source_socket})" if img_name else " <- источник не найден"))

            if color_input.is_linked:
                print("  [!] Emission Color уже подключен к нодам — пропускаю, обработай вручную")
                continue
            flat_color = tuple(color_input.default_value)
            print(f"  Emission Color сейчас — плоский цвет: {flat_color}")

            if source_tex_node is None or source_tex_node.image is None:
                print("  [!] не нашёл исходную картинку с маской — обработай вручную")
                continue

            if DRY_RUN:
                print("  (DRY RUN — ничего не меняю)")
                continue

            bake_and_rewire(obj, mat, nt, principled, colorramp_node, source_tex_node, flat_color)


def bake_and_rewire(obj, mat, nt, principled, colorramp_node, source_tex_node, flat_color):
    img = source_tex_node.image
    w, h = img.size[0], img.size[1]
    bake_name = f"{obj.name}_{mat.name}_EmissionBake".replace(' ', '_')

    new_img = bpy.data.images.new(bake_name, width=w, height=h, alpha=False)
    new_img.colorspace_settings.name = 'sRGB'

    bake_tex_node = nt.nodes.new('ShaderNodeTexImage')
    bake_tex_node.name = bake_name
    bake_tex_node.label = "Emission bake (авто)"
    bake_tex_node.image = new_img

    # используем ту же UV-развёртку, что и у исходной текстуры-маски
    if source_tex_node.inputs['Vector'].is_linked:
        uv_from = source_tex_node.inputs['Vector'].links[0].from_socket
        nt.links.new(uv_from, bake_tex_node.inputs['Vector'])

    # временная нода: маска (0..1) * плоский цвет свотча — именно её и запекаем
    mix, in1, in2, out_name = make_multiply_mix(nt)
    mix.name = f"{bake_name}_TEMP_MIX"
    nt.links.new(colorramp_node.outputs['Color'], mix.inputs[in1])
    mix.inputs[in2].default_value = flat_color

    strength_link = principled.inputs['Emission Strength'].links[0]
    original_strength_value = None
    # у Multiply-ноды обычно есть второй операнд с "силой" (например 2.3) —
    # попробуем найти плоское число где-то в цепочке Strength, иначе просто used 1.0
    src = strength_link.from_node
    if src.type == 'MATH':
        for inp in src.inputs:
            if not inp.is_linked:
                original_strength_value = inp.default_value
                break
    if original_strength_value is None:
        original_strength_value = 1.0

    # на время запекания подключаем Color <- mix, Strength делаем = 1.0
    # (запекаем именно "маска * цвет", силу применим отдельно уже после)
    nt.links.new(mix.outputs[out_name], principled.inputs['Emission Color'])
    nt.links.remove(strength_link)
    principled.inputs['Emission Strength'].default_value = 1.0

    nt.nodes.active = bake_tex_node
    for n in nt.nodes:
        n.select = (n == bake_tex_node)

    prev_engine = bpy.context.scene.render.engine
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    try:
        bpy.ops.object.bake(type='EMIT', margin=BAKE_MARGIN, use_clear=True)
        print(f"  [OK] запёк в новую текстуру '{bake_name}'")
    except Exception as e:
        print(f"  [ОШИБКА] запекание не удалось: {e}")
        bpy.context.scene.render.engine = prev_engine
        return
    bpy.context.scene.render.engine = prev_engine

    TEXTURE_OUT_DIR.mkdir(parents=True, exist_ok=True)
    new_img.filepath_raw = str(TEXTURE_OUT_DIR / f"{bake_name}.png")
    new_img.file_format = 'PNG'
    new_img.save()
    new_img.pack()  # чтобы точно попала в glTF как встроенная картинка

    # финальное переключение: Emission Color <- НАПРЯМУЮ новая текстура (без нод между ними)
    nt.links.new(bake_tex_node.outputs['Color'], principled.inputs['Emission Color'])
    principled.inputs['Emission Strength'].default_value = original_strength_value
    nt.nodes.remove(mix)

    print(f"  [OK] Emission Color теперь = '{bake_name}' напрямую, Strength = {original_strength_value}")


for _name in OBJECT_NAMES:
    process_object(_name)

if not DRY_RUN:
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), copy=True)
    print(f"Сохранено в новый файл: {OUT_BLEND}")
    print("Оригинальный .blend НЕ перезаписан — сначала проверь новый файл.")
else:
    print("\nЭто был DRY RUN. Если всё, что напечатано выше, совпадает с ожиданиями —")
    print("поставь DRY_RUN = False в начале скрипта и запусти ещё раз.")
