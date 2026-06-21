// ============= CollisionDetector.cs – Unity C# =============
// Attach to the cue ball. Registers the first ball hit each shot.
using UnityEngine;

public class CollisionDetector : MonoBehaviour
{
    void OnCollisionEnter(Collision col)
    {
        if (!gameObject.CompareTag("CueBall")) return;
        var ball = col.gameObject.GetComponent<EnhancedBall>();
        if (ball != null && !ball.isPotted)
            GameManager.Instance?.RegisterBallHit(ball);
    }
}