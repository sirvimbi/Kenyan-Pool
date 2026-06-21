using UnityEngine;
using System;

[Serializable]
public class Player
{
    public string playerId;
    public string playerName;
    public int score = 0;
    public int currentTargetBallNumber = 3;
    public bool isBenched = false;
    public float balance = 100000f;
    public int turnOrder = 0;
    public bool isAI = false;

    public Player(string id, string name, int order, bool ai = false)
    {
        playerId = id;
        playerName = name;
        turnOrder = order;
        isAI = ai;
        score = 0;
        currentTargetBallNumber = 3;
        isBenched = false;
        balance = 100000f;
    }

    public void AdvanceToNextTarget()
    {
        if (currentTargetBallNumber < 15)
        {
            currentTargetBallNumber++;
        }
        else
        {
            Debug.Log($"{playerName} has completed all balls!");
        }
    }

    public void AddPoints(int points)
    {
        score += points;
        Debug.Log($"{playerName} +{points} pts → total {score}");
    }

    public void SubtractPoints(int points)
    {
        score -= points;
        if (score < 0) score = 0;
        Debug.Log($"{playerName} -{points} pts → total {score}");
    }

    public bool HasCompletedAllBalls() => currentTargetBallNumber > 15;
}