using UnityEngine;
using System.Collections;

public class PocketDetector : MonoBehaviour
{
    private GameManager gm;

    void Start() => StartCoroutine(FindGM());

    IEnumerator FindGM()
    {
        for (int i = 0; i < 10; i++)
        {
            gm = GameManager.Instance ?? FindFirstObjectByType<GameManager>();
            if (gm != null) yield break;
            yield return null;
        }
        Debug.LogWarning("[PocketDetector] GameManager not found.");
    }

    void OnTriggerEnter(Collider other)
    {
        if (gm == null) gm = GameManager.Instance;
        if (gm == null) return;

        var ball = other.GetComponent<EnhancedBall>();
        if (ball != null && !ball.isPotted)
        {
            gm.RegisterPottedBall(ball);
            return;
        }

        if (other.CompareTag("CueBall"))
            gm.RegisterCueBallPotted();
    }
}