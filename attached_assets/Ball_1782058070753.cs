// ============= Ball.cs - COMPATIBILITY WRAPPER =============
// Provides backward compatibility for any scripts still referencing the old Ball class.
// All functionality lives in EnhancedBall; Ball simply inherits from it.
using UnityEngine;

public class Ball : EnhancedBall
{
    // Legacy property aliases so old code that reads .number / .potted still compiles.
    public int  number { get => ballNumber; set => ballNumber = value; }
    public bool potted { get => isPotted;   set => isPotted   = value; }

    public int PointValue
    {
        get
        {
            if (number == 0) return 0;
            if (number == 3) return 6;
            return number;
        }
    }

    public bool IsCue => number == 0;

    /// <summary>Legacy pot call — delegates to EnhancedBall.PotBall().</summary>
    public void Pot() => PotBall();

    /// <summary>Legacy reset call — delegates to EnhancedBall.ResetBall() then repositions.</summary>
    public void ResetTo(Vector3 pos)
    {
        ResetBall();
        transform.position = pos;
    }
}