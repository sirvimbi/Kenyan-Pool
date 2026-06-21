// ============= TrajectoryPredictor.cs =============
// FIXED VERSION - Add using statement for Ball/EnhancedBall
using UnityEngine;

public class TrajectoryPredictor : MonoBehaviour
{
    [Header("Trajectory Settings")]
    public LineRenderer trajectoryLine;
    public int maxReflections = 3;
    public float maxStepDistance = 8f;
    public LayerMask collisionLayers = -1;
    
    [Header("Visual Settings")]
    public Color trajectoryColor = Color.white;
    public Color hitColor = Color.red;
    public float lineWidth = 0.05f;
    
    [Header("Prediction")]
    public bool showPrediction = true;
    public float predictionUpdateRate = 0.02f;
    
    private Transform cueBall;
    private float lastUpdateTime;
    private Vector3 lastDirection;
    
    void Start()
    {
        if (trajectoryLine == null)
        {
            trajectoryLine = GetComponent<LineRenderer>();
            if (trajectoryLine == null)
            {
                trajectoryLine = gameObject.AddComponent<LineRenderer>();
            }
        }
        
        SetupLineRenderer();
        
        cueBall = GameObject.FindGameObjectWithTag("CueBall")?.transform;
    }
    
    void SetupLineRenderer()
    {
        trajectoryLine.startWidth = lineWidth;
        trajectoryLine.endWidth = lineWidth;
        trajectoryLine.startColor = trajectoryColor;
        trajectoryLine.endColor = trajectoryColor;
        trajectoryLine.material = new Material(Shader.Find("Sprites/Default"));
    }
    
    void Update()
    {
        if (!showPrediction || cueBall == null) return;
        
        if (Time.time - lastUpdateTime >= predictionUpdateRate)
        {
            PredictTrajectory();
            lastUpdateTime = Time.time;
        }
    }
    
    public void PredictTrajectory()
    {
        if (trajectoryLine == null) return;
        
        Vector3 startPosition = cueBall.position;
        Vector3 direction = transform.forward;
        
        if (lastDirection != direction)
        {
            lastDirection = direction;
        }
        
        trajectoryLine.positionCount = 0;
        trajectoryLine.positionCount++;
        trajectoryLine.SetPosition(trajectoryLine.positionCount - 1, startPosition);
        
        Vector3 currentPosition = startPosition;
        Vector3 currentDirection = direction;
        
        for (int i = 0; i < maxReflections; i++)
        {
            if (Physics.Raycast(currentPosition, currentDirection, out RaycastHit hit, maxStepDistance, collisionLayers))
            {
                trajectoryLine.positionCount++;
                trajectoryLine.SetPosition(trajectoryLine.positionCount - 1, hit.point);
                
                // Check if we hit a ball - using EnhancedBall instead of Ball
                EnhancedBall hitBall = hit.collider.GetComponent<EnhancedBall>();
                if (hitBall != null && !hitBall.isPotted)
                {
                    trajectoryLine.startColor = hitColor;
                    trajectoryLine.endColor = hitColor;
                    
                    if (i == 0)
                    {
                        ShowHitMarker(hit.point, hitBall);
                    }
                    break;
                }
                
                currentDirection = Vector3.Reflect(currentDirection, hit.normal);
                currentPosition = hit.point + currentDirection * 0.01f;
                
                trajectoryLine.startColor = trajectoryColor;
                trajectoryLine.endColor = trajectoryColor;
            }
            else
            {
                trajectoryLine.positionCount++;
                trajectoryLine.SetPosition(trajectoryLine.positionCount - 1, 
                    currentPosition + currentDirection * maxStepDistance);
                break;
            }
        }
    }
    
    void ShowHitMarker(Vector3 position, EnhancedBall targetBall)
    {
        Debug.DrawRay(position, Vector3.up * 0.5f, Color.red, 0.05f);
    }
    
    public void SetShowPrediction(bool show)
    {
        showPrediction = show;
        if (!show && trajectoryLine != null)
        {
            trajectoryLine.positionCount = 0;
        }
    }
    
    public void UpdateAimDirection(Vector3 direction)
    {
        transform.forward = direction;
    }
}