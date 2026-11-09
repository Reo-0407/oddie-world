# Blender 안에서 실행: blender -b -P thumbs.py -- <GLB 폴더> <출력 폴더>
# 각 GLB를 정면 3/4 각도로 찍어 192x192 투명 PNG로 저장한다(이미 있으면 건너뜀).
import bpy, sys, os, glob, math
from mathutils import Vector

src, dst = [os.path.abspath(p) for p in sys.argv[sys.argv.index('--') + 1:][:2]]
os.makedirs(dst, exist_ok=True)

for path in sorted(glob.glob(os.path.join(src, '*.glb'))):
    out = os.path.join(dst, os.path.splitext(os.path.basename(path))[0] + '.png')
    if os.path.exists(out):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    # 한 덩어리 메시 안의 떨어진 조각들을 나눈다(바닥판이 캐릭터와 붙어 있지 않은 경우)
    for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='LOOSE')
        bpy.ops.object.mode_set(mode='OBJECT')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    # 바닥판(납작하고 넓은 조각)은 캐릭터가 아니므로 지운다
    def dims(o):
        return o.dimensions
    biggest = max(max(dims(o)) for o in meshes)
    for o in list(meshes):
        d = sorted(dims(o))
        if len(meshes) > 1 and d[0] < 0.06 * d[2] and d[2] > 0.5 * biggest:
            bpy.data.objects.remove(o, do_unlink=True)
            print('PLATE', os.path.basename(path))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        continue
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.01)

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = scene.render.resolution_y = 192
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'TEXTURE'
    shading.show_specular_highlight = False
    scene.view_settings.view_transform = 'Standard'

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    dist = radius * 3.2
    angle = math.radians(25)   # 정면(-Y)에서 오른쪽으로 25도
    elev = math.radians(15)
    cam.location = center + Vector((math.sin(angle) * math.cos(elev), -math.cos(angle) * math.cos(elev), math.sin(elev))) * dist
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('OK', out)
