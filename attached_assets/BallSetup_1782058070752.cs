using UnityEngine;

public class BallSetup : MonoBehaviour
{
    [Header("Table Dimensions (WPA 9ft)")]
    public float tableLength = 2.54f;
    public float tableWidth = 1.27f;
    public float ballRadius = 0.028575f;
    public float clothY = 0.80f;

    [Header("Prefab (optional)")]
    public GameObject ballPrefab;
    public Transform tableSurface;

    void Start() => Build();

    [ContextMenu("Place Kenyan Cushion Layout")]
    public void Build()
    {
        ClearChildren();
        float y = (tableSurface ? tableSurface.position.y : clothY) + ballRadius;
        float halfL = tableLength / 2f - ballRadius * 1.1f;
        float halfW = tableWidth  / 2f - ballRadius * 1.1f;

        // 1) Center ball #3
        SpawnBall(3, new Vector3(0, y, 0));

        // 2) Left rail ( -X )
        SpawnBall(4,  new Vector3(-halfL, y,  halfW * 0.6f));
        SpawnBall(5,  new Vector3(-halfL, y,  halfW * 0.2f));
        SpawnBall(6,  new Vector3(-halfL, y, -halfW * 0.2f));
        SpawnBall(7,  new Vector3(-halfL, y, -halfW * 0.6f));

        // Right rail ( +X )
        SpawnBall(8,  new Vector3( halfL, y,  halfW * 0.6f));
        SpawnBall(9,  new Vector3( halfL, y,  halfW * 0.2f));
        SpawnBall(10, new Vector3( halfL, y, -halfW * 0.2f));
        SpawnBall(11, new Vector3( halfL, y, -halfW * 0.6f));

        // Top rail ( +Z )
        SpawnBall(12, new Vector3( halfL * 0.6f, y,  halfW));
        SpawnBall(13, new Vector3( halfL * 0.2f, y,  halfW));
        SpawnBall(14, new Vector3(-halfL * 0.2f, y,  halfW));
        SpawnBall(15, new Vector3(-halfL * 0.6f, y,  halfW));

        // Bottom rail ( -Z )
        SpawnBall(16, new Vector3( halfL * 0.6f, y, -halfW));
        SpawnBall(17, new Vector3( halfL * 0.2f, y, -halfW));
        SpawnBall(18, new Vector3(-halfL * 0.2f, y, -halfW));
        SpawnBall(19, new Vector3(-halfL * 0.6f, y, -halfW));

        // Cue ball – head spot (1/4 from bottom)
        SpawnCueBall(new Vector3(-tableLength * 0.25f, y, 0));
    }

    void SpawnBall(int num, Vector3 pos)
    {
        GameObject go = ballPrefab ? Instantiate(ballPrefab, transform) : GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = $"Ball_{num}";
        go.transform.SetParent(transform);
        go.transform.position = pos;
        go.transform.localScale = Vector3.one * (ballRadius * 2f);

        var ball = go.GetComponent<EnhancedBall>() ?? go.AddComponent<EnhancedBall>();
        ball.ballNumber = num;
        ball.pointValue = (num == 3) ? 6 : num;

        PaintBall(go, BallColor(num));
    }

    void SpawnCueBall(Vector3 pos)
    {
        GameObject go = ballPrefab ? Instantiate(ballPrefab, transform) : GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = "CueBall";
        go.tag = "CueBall";
        go.transform.SetParent(transform);
        go.transform.position = pos;
        go.transform.localScale = Vector3.one * (ballRadius * 2f);

        var ball = go.GetComponent<EnhancedBall>() ?? go.AddComponent<EnhancedBall>();
        ball.ballNumber = 0;
        ball.pointValue = 0;

        PaintBall(go, Color.white);
        go.AddComponent<CollisionDetector>();
    }

    static Color BallColor(int num) => num switch
    {
        3  => new Color(0.85f, 0.12f, 0.10f), 4  => new Color(0.50f, 0.10f, 0.70f),
        5  => new Color(0.95f, 0.50f, 0.05f), 6  => new Color(0.10f, 0.55f, 0.18f),
        7  => new Color(0.45f, 0.14f, 0.08f), 8  => new Color(0.08f, 0.08f, 0.08f),
        9  => new Color(0.95f, 0.85f, 0.08f), 10 => new Color(0.10f, 0.28f, 0.85f),
        11 => new Color(0.90f, 0.32f, 0.28f), 12 => new Color(0.70f, 0.38f, 0.85f),
        13 => new Color(0.95f, 0.65f, 0.28f), 14 => new Color(0.28f, 0.75f, 0.38f),
        15 => new Color(0.65f, 0.28f, 0.22f), _ => Color.grey
    };

    static void PaintBall(GameObject go, Color color)
    {
        var r = go.GetComponent<MeshRenderer>();
        if (r == null) return;
        var mat = new Material(r.sharedMaterial);
        mat.color = color;
        mat.SetFloat("_Smoothness", 0.92f);
        r.sharedMaterial = mat;
    }

    void ClearChildren()
    {
        for (int i = transform.childCount - 1; i >= 0; i--)
        {
            var c = transform.GetChild(i);
            if (Application.isPlaying) Destroy(c.gameObject);
            else DestroyImmediate(c.gameObject);
        }
    }
}