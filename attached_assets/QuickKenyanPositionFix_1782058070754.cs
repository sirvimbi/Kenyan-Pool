using UnityEngine;

public class KenyanCushionPositioner : MonoBehaviour
{
    [Header("Ball References")]
    public GameObject ball1;
    public GameObject ball2;
    public GameObject ball3;
    public GameObject ball4;
    public GameObject ball5;
    public GameObject ball6;
    public GameObject ball7;
    public GameObject ball8;
    public GameObject ball9;
    public GameObject ball10;
    public GameObject ball11;
    public GameObject ball12;
    public GameObject ball13;
    public GameObject ball14;
    public GameObject ball15;
    public GameObject cueBall;
    
    [Header("Cue Stick References")]
    public GameObject cueStick1;
    public GameObject cueStick2;
    
    [Header("Table References")]
    public GameObject tableInnerEdges;
    public GameObject playingSurface;
    
    [ContextMenu("Position All Objects - Kenyan Pool Layout")]
    public void PositionAllObjects()
    {
        Debug.Log("=== Starting to position all objects for Kenyan Pool ===");
        
        // Position all balls with their exact coordinates
        PositionBall(ball1, 1.12399995f, 0.100000001f, -0.499999911f, "Ball 1");
        PositionBall(ball2, 1.02100003f, 0.100000001f, -0.439999908f, "Ball 2");
        PositionBall(ball3, 0.699999988f, 0.769999981f, -0.5f, "Ball 3");
        PositionBall(ball4, 1.26900005f, 0.769999981f, -0.200000003f, "Ball 4");
        PositionBall(ball5, -1.26900005f, 0.769999981f, -0.800000012f, "Ball 5");
        PositionBall(ball6, 0.939999998f, 0.769999981f, 0.118000001f, "Ball 6");
        PositionBall(ball7, 0.939999998f, 0.769999981f, -1.11800003f, "Ball 7");
        PositionBall(ball8, -0.949999988f, 0.769999981f, 0.118000001f, "Ball 8");
        PositionBall(ball9, -0.949999988f, 0.769999981f, -1.11800003f, "Ball 9");
        PositionBall(ball10, -0.360000014f, 0.769999981f, -1.11800003f, "Ball 10");
        PositionBall(ball11, -0.360000014f, 0.769999981f, 0.118000001f, "Ball 11");
        PositionBall(ball12, 0.340000004f, 0.769999981f, -1.11800003f, "Ball 12");
        PositionBall(ball13, 0.340000004f, 0.769999981f, 0.118000001f, "Ball 13");
        PositionBall(ball14, -1.26900005f, 0.769999981f, -0.200000003f, "Ball 14");
        PositionBall(ball15, 1.26900005f, 0.769999981f, -0.800000012f, "Ball 15");
        
        // Position Cue Ball
        PositionBall(cueBall, -0.699999988f, 0.769999981f, -0.5f, "Cue Ball");
        
        // Position Cue Sticks
        PositionCueStick(cueStick1, 0.51700002f, 0.745000005f, -1.03699994f, 
                        new Vector3(359.399994f, 275f, 0f), "Cue Stick 1");
        PositionCueStick(cueStick2, 0.453999996f, 0.742999971f, -0.952000022f, 
                        new Vector3(359.399994f, 285f, 0f), "Cue Stick 2");
        
        // Position Table Objects
        PositionTableObject(tableInnerEdges, -1.33000004f, 0.789999962f, -0.5f, 
                           new Vector3(270f, 0f, 0f), "Table Inner Edges");
        PositionTableObject(playingSurface, 0f, 0.74000001f, -0.5f, 
                           new Vector3(270f, 0f, 0f), "Playing Surface");
        
        Debug.Log("✅ All objects positioned successfully!");
        Debug.Log("⚠️ Note: Balls 1 and 2 are not used in Kenyan Pool (they remain at their positions)");
    }
    
    [ContextMenu("Position Only Balls")]
    public void PositionOnlyBalls()
    {
        Debug.Log("Positioning only balls...");
        
        PositionBall(ball1, 1.12399995f, 0.100000001f, -0.499999911f, "Ball 1");
        PositionBall(ball2, 1.02100003f, 0.100000001f, -0.439999908f, "Ball 2");
        PositionBall(ball3, 0.699999988f, 0.769999981f, -0.5f, "Ball 3");
        PositionBall(ball4, 1.26900005f, 0.769999981f, -0.200000003f, "Ball 4");
        PositionBall(ball5, -1.26900005f, 0.769999981f, -0.800000012f, "Ball 5");
        PositionBall(ball6, 0.939999998f, 0.769999981f, 0.118000001f, "Ball 6");
        PositionBall(ball7, 0.939999998f, 0.769999981f, -1.11800003f, "Ball 7");
        PositionBall(ball8, -0.949999988f, 0.769999981f, 0.118000001f, "Ball 8");
        PositionBall(ball9, -0.949999988f, 0.769999981f, -1.11800003f, "Ball 9");
        PositionBall(ball10, -0.360000014f, 0.769999981f, -1.11800003f, "Ball 10");
        PositionBall(ball11, -0.360000014f, 0.769999981f, 0.118000001f, "Ball 11");
        PositionBall(ball12, 0.340000004f, 0.769999981f, -1.11800003f, "Ball 12");
        PositionBall(ball13, 0.340000004f, 0.769999981f, 0.118000001f, "Ball 13");
        PositionBall(ball14, -1.26900005f, 0.769999981f, -0.200000003f, "Ball 14");
        PositionBall(ball15, 1.26900005f, 0.769999981f, -0.800000012f, "Ball 15");
        PositionBall(cueBall, -0.699999988f, 0.769999981f, -0.5f, "Cue Ball");
        
        Debug.Log("✅ All balls positioned!");
    }
    
    [ContextMenu("Position Only Cue Sticks")]
    public void PositionOnlyCueSticks()
    {
        Debug.Log("Positioning cue sticks...");
        
        PositionCueStick(cueStick1, 0.51700002f, 0.745000005f, -1.03699994f, 
                        new Vector3(359.399994f, 275f, 0f), "Cue Stick 1");
        PositionCueStick(cueStick2, 0.453999996f, 0.742999971f, -0.952000022f, 
                        new Vector3(359.399994f, 285f, 0f), "Cue Stick 2");
        
        Debug.Log("✅ Cue sticks positioned!");
    }
    
    [ContextMenu("Position Only Table Objects")]
    public void PositionOnlyTableObjects()
    {
        Debug.Log("Positioning table objects...");
        
        PositionTableObject(tableInnerEdges, -1.33000004f, 0.789999962f, -0.5f, 
                           new Vector3(270f, 0f, 0f), "Table Inner Edges");
        PositionTableObject(playingSurface, 0f, 0.74000001f, -0.5f, 
                           new Vector3(270f, 0f, 0f), "Playing Surface");
        
        Debug.Log("✅ Table objects positioned!");
    }
    
    [ContextMenu("Reset All Physics")]
    public void ResetAllPhysics()
    {
        GameObject[] allObjects = { ball1, ball2, ball3, ball4, ball5, ball6, ball7, 
                                    ball8, ball9, ball10, ball11, ball12, ball13, 
                                    ball14, ball15, cueBall };
        
        int resetCount = 0;
        foreach (GameObject obj in allObjects)
        {
            if (obj != null)
            {
                Rigidbody rb = obj.GetComponent<Rigidbody>();
                if (rb != null)
                {
                    rb.linearVelocity = Vector3.zero;
                    rb.angularVelocity = Vector3.zero;
                    rb.Sleep();
                    resetCount++;
                }
            }
        }
        
        Debug.Log($"✅ Reset physics on {resetCount} objects");
    }
    
    private void PositionBall(GameObject ball, float x, float y, float z, string name)
    {
        if (ball != null)
        {
            // Set position
            ball.transform.position = new Vector3(x, y, z);
            
            // Set rotation (270, 270, 0)
            ball.transform.rotation = Quaternion.Euler(270f, 270f, 0f);
            
            // Set scale
            ball.transform.localScale = Vector3.one;
            
            // Reset physics
            Rigidbody rb = ball.GetComponent<Rigidbody>();
            if (rb != null)
            {
                rb.linearVelocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.Sleep();
            }
            
            Debug.Log($"✓ Positioned {name} at ({x}, {y}, {z}) with rotation (270, 270, 0)");
        }
        else
        {
            Debug.LogWarning($"⚠️ {name} is not assigned in the inspector!");
        }
    }
    
    private void PositionCueStick(GameObject stick, float x, float y, float z, Vector3 rotation, string name)
    {
        if (stick != null)
        {
            stick.transform.position = new Vector3(x, y, z);
            stick.transform.rotation = Quaternion.Euler(rotation);
            stick.transform.localScale = Vector3.one;
            
            Debug.Log($"✓ Positioned {name} at ({x}, {y}, {z}) with rotation ({rotation.x}, {rotation.y}, {rotation.z})");
        }
        else
        {
            Debug.LogWarning($"⚠️ {name} is not assigned in the inspector!");
        }
    }
    
    private void PositionTableObject(GameObject obj, float x, float y, float z, Vector3 rotation, string name)
    {
        if (obj != null)
        {
            obj.transform.position = new Vector3(x, y, z);
            obj.transform.rotation = Quaternion.Euler(rotation);
            obj.transform.localScale = Vector3.one;
            
            Debug.Log($"✓ Positioned {name} at ({x}, {y}, {z}) with rotation ({rotation.x}, {rotation.y}, {rotation.z})");
        }
        else
        {
            Debug.LogWarning($"⚠️ {name} is not assigned in the inspector!");
        }
    }
    
    [ContextMenu("Auto-Find All Objects")]
    public void AutoFindAllObjects()
    {
        Debug.Log("Auto-finding all objects in scene...");
        
        // Find all objects with "Ball" or specific numbers in their name - UPDATED
        GameObject[] allObjects = FindObjectsByType<GameObject>(FindObjectsSortMode.None);
        
        foreach (GameObject obj in allObjects)
        {
            string name = obj.name.ToLower();
            
            // Find balls
            if (name.Contains("ball"))
            {
                if (name.Contains("ball1") || name.Contains("ball 1") || name.Contains("ball_1")) ball1 = obj;
                if (name.Contains("ball2") || name.Contains("ball 2") || name.Contains("ball_2")) ball2 = obj;
                if (name.Contains("ball3") || name.Contains("ball 3") || name.Contains("ball_3")) ball3 = obj;
                if (name.Contains("ball4") || name.Contains("ball 4") || name.Contains("ball_4")) ball4 = obj;
                if (name.Contains("ball5") || name.Contains("ball 5") || name.Contains("ball_5")) ball5 = obj;
                if (name.Contains("ball6") || name.Contains("ball 6") || name.Contains("ball_6")) ball6 = obj;
                if (name.Contains("ball7") || name.Contains("ball 7") || name.Contains("ball_7")) ball7 = obj;
                if (name.Contains("ball8") || name.Contains("ball 8") || name.Contains("ball_8")) ball8 = obj;
                if (name.Contains("ball9") || name.Contains("ball 9") || name.Contains("ball_9")) ball9 = obj;
                if (name.Contains("ball10") || name.Contains("ball 10") || name.Contains("ball_10")) ball10 = obj;
                if (name.Contains("ball11") || name.Contains("ball 11") || name.Contains("ball_11")) ball11 = obj;
                if (name.Contains("ball12") || name.Contains("ball 12") || name.Contains("ball_12")) ball12 = obj;
                if (name.Contains("ball13") || name.Contains("ball 13") || name.Contains("ball_13")) ball13 = obj;
                if (name.Contains("ball14") || name.Contains("ball 14") || name.Contains("ball_14")) ball14 = obj;
                if (name.Contains("ball15") || name.Contains("ball 15") || name.Contains("ball_15")) ball15 = obj;
                
                // Find cue ball
                if (name.Contains("cue") || name.Contains("white") || (name.Contains("ball") && !name.Contains("1") && !name.Contains("2") && !name.Contains("3") && !name.Contains("4") && !name.Contains("5") && !name.Contains("6") && !name.Contains("7") && !name.Contains("8") && !name.Contains("9") && !name.Contains("10") && !name.Contains("11") && !name.Contains("12") && !name.Contains("13") && !name.Contains("14") && !name.Contains("15")))
                {
                    cueBall = obj;
                }
            }
            
            // Find cue sticks
            if (name.Contains("cuestick") || name.Contains("cue stick") || name.Contains("cue-stick"))
            {
                if (name.Contains("1") || name.Contains("01")) cueStick1 = obj;
                else if (name.Contains("2") || name.Contains("02")) cueStick2 = obj;
                else if (cueStick1 == null) cueStick1 = obj;
                else if (cueStick2 == null) cueStick2 = obj;
            }
            
            // Find table objects
            if (name.Contains("inner") || (name.Contains("edge") && name.Contains("table"))) tableInnerEdges = obj;
            if (name.Contains("surface") || (name.Contains("plane") && name.Contains("playing"))) playingSurface = obj;
        }
        
        Debug.Log("Auto-find complete! Please verify all objects are assigned correctly in the inspector.");
        Debug.Log($"Found: Balls (1-15) and Cue Ball, Cue Sticks (2), Table objects (2)");
    }
    
    [ContextMenu("Show Position Summary")]
    public void ShowPositionSummary()
    {
        Debug.Log("=== POSITION SUMMARY ===");
        Debug.Log($"Ball 3 (starting ball): ({ball3?.transform.position.x}, {ball3?.transform.position.y}, {ball3?.transform.position.z})");
        Debug.Log($"Cue Ball: ({cueBall?.transform.position.x}, {cueBall?.transform.position.y}, {cueBall?.transform.position.z})");
        Debug.Log($"Table Inner Edges: ({tableInnerEdges?.transform.position.x}, {tableInnerEdges?.transform.position.y}, {tableInnerEdges?.transform.position.z})");
        Debug.Log($"Playing Surface: ({playingSurface?.transform.position.x}, {playingSurface?.transform.position.y}, {playingSurface?.transform.position.z})");
        Debug.Log("=========================");
        
        // Count balls on table surface (Y = 0.77 approx)
        int ballsOnSurface = 0;
        GameObject[] balls = { ball3, ball4, ball5, ball6, ball7, ball8, ball9, ball10, ball11, ball12, ball13, ball14, ball15, cueBall };
        foreach (GameObject ball in balls)
        {
            if (ball != null && ball.transform.position.y > 0.75f && ball.transform.position.y < 0.78f)
            {
                ballsOnSurface++;
            }
        }
        Debug.Log($"Balls correctly positioned on playing surface: {ballsOnSurface}/14");
    }
}