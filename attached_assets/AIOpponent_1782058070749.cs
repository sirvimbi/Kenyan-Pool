using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

public class AIOpponent : MonoBehaviour
{
    public enum AIDifficulty { Easy, Medium, Hard }
    public AIDifficulty difficulty = AIDifficulty.Medium;

    [Range(0f, 1f)] public float easyAccuracy = 0.4f, mediumAccuracy = 0.68f, hardAccuracy = 0.9f;
    public float minThinkTime = 0.8f, maxThinkTime = 2.5f, shootDelay = 0.5f;
    public CueStick cueStick;
    public GameObject cueBallObject;

    private GameManager gm;
    private float currentAccuracy => difficulty switch
    {
        AIDifficulty.Easy => easyAccuracy,
        AIDifficulty.Medium => mediumAccuracy,
        _ => hardAccuracy
    };

    void Awake()
    {
        gm = FindFirstObjectByType<GameManager>();
        if (cueStick == null) cueStick = FindFirstObjectByType<CueStick>();
        if (cueBallObject == null) cueBallObject = GameObject.FindGameObjectWithTag("CueBall");
    }

    public void TakeTurn(Player aiPlayer, List<EnhancedBall> balls)
    {
        StartCoroutine(AITurnRoutine(aiPlayer, balls));
    }

    IEnumerator AITurnRoutine(Player aiPlayer, List<EnhancedBall> balls)
    {
        yield return new WaitForSeconds(Random.Range(minThinkTime, maxThinkTime));

        EnhancedBall target = balls.FirstOrDefault(b => b.ballNumber == aiPlayer.currentTargetBallNumber && !b.isPotted);
        if (target == null || cueBallObject == null)
        {
            gm?.ResolveShotOutcome();
            yield break;
        }

        Vector3 idealDir = (target.transform.position - cueBallObject.transform.position).normalized;
        idealDir.y = 0;
        float maxError = (1f - currentAccuracy) * 25f;
        float angleOffset = Random.Range(-maxError, maxError);
        Vector3 finalDir = Quaternion.Euler(0, angleOffset, 0) * idealDir;

        float distance = Vector3.Distance(cueBallObject.transform.position, target.transform.position);
        float power = Mathf.Clamp(distance * 3.5f + Random.Range(-2f, 3f), 5f, 20f);

        cueStick.SetAimDirection(finalDir);
        yield return new WaitForSeconds(shootDelay);
        cueStick.ForceShoot(power);
        Debug.Log($"[AI] {aiPlayer.playerName} shoots at #{aiPlayer.currentTargetBallNumber} | power={power:F1}");
    }
}