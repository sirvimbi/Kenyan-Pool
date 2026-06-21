using UnityEngine;

[ExecuteAlways]
public class SaloonEnvironment : MonoBehaviour
{
    [Header("Dimensions (meters)")]
    public Vector3 roomSize = new Vector3(20f, 5f, 14f);

    [Header("Toggles")]
    public bool buildFloor         = true;
    public bool buildWalls         = true;
    public bool buildCeiling       = true;
    public bool buildOverheadLamps = true;
    public bool buildSconces       = true;
    public bool buildNeonSign      = true;
    public bool buildBarStools     = true;

    [Header("Lighting")]
    public Color tungstenColor = new Color(1f, 0.78f, 0.42f);
    public float lampIntensity = 2.5f;

    static Shader GetSafeShader()
    {
        var urpLit = Shader.Find("Universal Render Pipeline/Lit");
        return urpLit != null ? urpLit : Shader.Find("Standard");
    }

    void Start() { if (Application.isPlaying) Build(); }

    [ContextMenu("Build Saloon")]
    public void Build()
    {
        Clear();
        if (buildFloor)         BuildFloor();
        if (buildWalls)         BuildWalls();
        if (buildCeiling)       BuildCeiling();
        if (buildOverheadLamps) BuildOverheadLamps();
        if (buildSconces)       BuildSconces();
        if (buildNeonSign)      BuildNeonSign();
        if (buildBarStools)     BuildBarStools();
    }

    public void Clear()
    {
        for (int i = transform.childCount - 1; i >= 0; i--)
        {
            var c = transform.GetChild(i);
            if (Application.isPlaying) Destroy(c.gameObject);
            else                       DestroyImmediate(c.gameObject);
        }
    }

    void BuildFloor()
    {
        var go = Prim(PrimitiveType.Plane, "Floor");
        go.transform.localScale = new Vector3(roomSize.x / 10f, 1f, roomSize.z / 10f);
        Paint(go, UIColors.WoodDark);
    }

    void BuildWalls()
    {
        Wall("Wall_Back",  new Vector3(0,              roomSize.y/2f,  roomSize.z/2f), new Vector3(roomSize.x, roomSize.y, 0.2f));
        Wall("Wall_Front", new Vector3(0,              roomSize.y/2f, -roomSize.z/2f), new Vector3(roomSize.x, roomSize.y, 0.2f));
        Wall("Wall_Left",  new Vector3(-roomSize.x/2f, roomSize.y/2f, 0),              new Vector3(0.2f, roomSize.y, roomSize.z));
        Wall("Wall_Right", new Vector3( roomSize.x/2f, roomSize.y/2f, 0),              new Vector3(0.2f, roomSize.y, roomSize.z));
    }

    void Wall(string n, Vector3 pos, Vector3 size)
    {
        var go = Prim(PrimitiveType.Cube, n);
        go.transform.localPosition = pos;
        go.transform.localScale    = size;
        Paint(go, UIColors.WoodWalnut);
    }

    void BuildCeiling()
    {
        var go = Prim(PrimitiveType.Cube, "Ceiling");
        go.transform.localPosition = new Vector3(0, roomSize.y, 0);
        go.transform.localScale    = new Vector3(roomSize.x, 0.1f, roomSize.z);
        Paint(go, UIColors.WoodDark);
    }

    void BuildOverheadLamps()
    {
        for (int i = 0; i < 2; i++)
        {
            float xPos = (i == 0) ? -2.5f : 2.5f;
            var lamp = new GameObject($"OverheadLamp_{i}");
            lamp.transform.SetParent(transform);
            lamp.transform.localPosition = new Vector3(xPos, roomSize.y - 1.5f, 0);

            var cord = Prim(PrimitiveType.Cylinder, "Cord", lamp.transform);
            cord.transform.localPosition = new Vector3(0, 0.75f, 0);
            cord.transform.localScale    = new Vector3(0.02f, 0.75f, 0.02f);
            Paint(cord, Color.black);

            var shade = Prim(PrimitiveType.Cylinder, "Shade", lamp.transform);
            shade.transform.localPosition = Vector3.zero;
            shade.transform.localScale    = new Vector3(0.6f, 0.25f, 0.6f);
            Paint(shade, UIColors.WoodWalnut);

            var lightGO = new GameObject("Light");
            lightGO.transform.SetParent(lamp.transform);
            lightGO.transform.localPosition = new Vector3(0, -0.3f, 0);
            var l = lightGO.AddComponent<Light>();
            l.type = LightType.Spot; l.color = tungstenColor;
            l.intensity = lampIntensity; l.range = 8f; l.spotAngle = 80f;
            l.shadows = LightShadows.Soft;
        }
    }

    void BuildSconces()
    {
        for (int i = 0; i < 4; i++)
        {
            float xSign = (i % 2 == 0) ? -1f : 1f;
            float zSign = (i  < 2)     ? -1f : 1f;
            var sconce = new GameObject($"Sconce_{i}");
            sconce.transform.SetParent(transform);
            sconce.transform.localPosition = new Vector3(xSign * (roomSize.x/2f - 0.3f), 3f, zSign * 3f);

            var bracket = Prim(PrimitiveType.Cube, "Bracket", sconce.transform);
            bracket.transform.localScale = new Vector3(0.15f, 0.4f, 0.15f);
            Paint(bracket, UIColors.WoodLight);

            var lGO = new GameObject("Light"); lGO.transform.SetParent(sconce.transform);
            var l   = lGO.AddComponent<Light>();
            l.type = LightType.Point; l.color = tungstenColor; l.intensity = 1.2f; l.range = 4f;
        }
    }

    void BuildNeonSign()
    {
        var sign = Prim(PrimitiveType.Cube, "NeonBeerSign");
        sign.transform.localPosition = new Vector3(roomSize.x/2f - 0.3f, 3.5f, 0);
        sign.transform.localScale    = new Vector3(0.1f, 1.2f, 2.5f);
        var mat = CloneMat(sign);
        mat.color = Color.black;
        mat.EnableKeyword("_EMISSION");
        mat.SetColor("_EmissionColor", UIColors.NeonGreen * 3f);
        sign.GetComponent<MeshRenderer>().sharedMaterial = mat;

        var gGO = new GameObject("NeonGlow"); gGO.transform.SetParent(sign.transform);
        var g   = gGO.AddComponent<Light>();
        g.type = LightType.Point; g.color = UIColors.NeonGreen; g.intensity = 2f; g.range = 5f;
    }

    void BuildBarStools()
    {
        Vector3[] pos = {
            new Vector3(-roomSize.x/2f + 1.5f, 0, -roomSize.z/2f + 1.5f),
            new Vector3(-roomSize.x/2f + 3.0f, 0, -roomSize.z/2f + 1.5f),
            new Vector3( roomSize.x/2f - 3.0f, 0, -roomSize.z/2f + 1.5f),
            new Vector3( roomSize.x/2f - 1.5f, 0, -roomSize.z/2f + 1.5f)
        };
        for (int i = 0; i < pos.Length; i++)
        {
            var stool = new GameObject($"BarStool_{i}");
            stool.transform.SetParent(transform);
            stool.transform.localPosition = pos[i];

            var pole = Prim(PrimitiveType.Cylinder, "Pole", stool.transform);
            pole.transform.localPosition = new Vector3(0, 0.5f, 0);
            pole.transform.localScale    = new Vector3(0.08f, 0.5f, 0.08f);
            Paint(pole, UIColors.WoodLight);

            var seat = Prim(PrimitiveType.Cylinder, "Seat", stool.transform);
            seat.transform.localPosition = new Vector3(0, 1.05f, 0);
            seat.transform.localScale    = new Vector3(0.5f, 0.08f, 0.5f);
            Paint(seat, UIColors.Red);
        }
    }

    GameObject Prim(PrimitiveType type, string name, Transform parent = null)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        go.transform.SetParent(parent != null ? parent : transform);
        go.transform.localPosition = Vector3.zero;
        go.transform.localRotation = Quaternion.identity;
        go.transform.localScale    = Vector3.one;
        return go;
    }

    static void Paint(GameObject go, Color color)
    {
        var r = go.GetComponent<MeshRenderer>();
        if (r == null) return;
        var mat = CloneMat(go);
        mat.color = color;
        r.sharedMaterial = mat;
    }

    static Material CloneMat(GameObject go)
    {
        var r = go.GetComponent<MeshRenderer>();
        var newMat = new Material(GetSafeShader());
        if (r.sharedMaterial != null)
            newMat.CopyPropertiesFromMaterial(r.sharedMaterial);
        return newMat;
    }
}