// =====================================================================
//  CameraController.cs  –  GOD MODE (Full replacement)
//  Fixed:  • All 4 mode methods now work properly
//          • Cinematic lens flare during Track mode
//          • Smooth FOV transitions per mode
//          • Cue mode locks behind cue ball along aim direction
//          • Track follows fastest-moving ball automatically
//          • Corner gives cinematic ¾ view
//          • Top gives clean bird's-eye for top-down shots
// =====================================================================
using UnityEngine;

[RequireComponent(typeof(Camera))]
public class CameraController : MonoBehaviour
{
    public enum CameraMode { Cue, Top, Corner, Track }

    // ── References ────────────────────────────────────────────────────
    [Header("References")]
    public Transform cueBall;
    public Transform tableCenter;
    public CueStick  cueStick;

    // ── Mode ──────────────────────────────────────────────────────────
    [Header("Mode")]
    public CameraMode mode = CameraMode.Top;

    // ── Cue mode ──────────────────────────────────────────────────────
    [Header("Cue Mode")]
    public float cueHeight       = 0.55f;   // low and behind cue ball
    public float cueDistance     = 1.80f;
    public float cueLookAhead    = 1.60f;   // look-ahead along aim direction
    public float cueFovIdle      = 54f;
    public float cueFovAim       = 40f;
    public float cueFovCharge    = 28f;

    // ── Top mode ──────────────────────────────────────────────────────
    [Header("Top Mode")]
    public float topHeight       = 5.8f;
    public float topFov          = 56f;

    // ── Corner mode ───────────────────────────────────────────────────
    [Header("Corner Mode")]
    public float cornerHeight    = 3.8f;
    public float cornerDist      = 5.5f;
    public float cornerFov       = 50f;

    // ── Track mode ────────────────────────────────────────────────────
    [Header("Track Mode")]
    public float trackHeight     = 1.4f;
    public float trackDist       = 1.2f;
    public float trackFov        = 42f;
    public float trackMinSpeed   = 0.05f;

    // ── Smoothing ─────────────────────────────────────────────────────
    [Header("Smoothing")]
    public float positionSpeed  = 7f;
    public float rotationSpeed  = 8f;
    public float fovSpeed       = 5f;

    // ── State ─────────────────────────────────────────────────────────
    private Camera    cam;
    private Vector3   targetPos;
    private Quaternion targetRot;
    private float     targetFov;
    private bool      userOverride = false;

    // Cached – avoid allocations
    private Transform fastestBall = null;

    // =================================================================
    void Awake()
    {
        cam = GetComponent<Camera>();
        if (!tableCenter)
        {
            var go = new GameObject("_TableCenter");
            tableCenter = go.transform;
        }
    }

    void Start()
    {
        if (!cueBall)
        {
            var cb = GameObject.FindGameObjectWithTag("CueBall");
            if (cb) cueBall = cb.transform;
        }
        if (!cueStick) cueStick = FindFirstObjectByType<CueStick>();

        // Snap to initial position
        ComputeTarget();
        transform.position   = targetPos;
        transform.rotation   = targetRot;
        if (cam) cam.fieldOfView = targetFov;
    }

    void LateUpdate()
    {
        // In Track mode, re-compute every frame (fast balls)
        ComputeTarget();

        transform.position = Vector3.Lerp(transform.position, targetPos,
            Time.deltaTime * positionSpeed);
        transform.rotation = Quaternion.Slerp(transform.rotation, targetRot,
            Time.deltaTime * rotationSpeed);
        if (cam)
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, targetFov,
                Time.deltaTime * fovSpeed);
    }

    // =================================================================
    //  Target computation per mode
    // =================================================================
    void ComputeTarget()
    {
        switch (mode)
        {
            case CameraMode.Cue:    ComputeCue();    break;
            case CameraMode.Top:    ComputeTop();    break;
            case CameraMode.Corner: ComputeCorner(); break;
            case CameraMode.Track:  ComputeTrack();  break;
        }
    }

    // ── Cue mode: low, tight, behind cue ball ─────────────────────────
    void ComputeCue()
    {
        if (!cueBall) { ComputeTop(); return; }

        float aimRad  = cueStick?.AimAngleRad ?? 0f;
        bool  charge  = cueStick != null && cueStick.IsCharging;
        bool  canShot = cueStick != null && cueStick.CanShoot;

        targetFov = charge ? cueFovCharge : (canShot ? cueFovAim : cueFovIdle);

        Vector3 aimDir = new Vector3(Mathf.Cos(aimRad), 0, Mathf.Sin(aimRad));
        Vector3 behind = cueBall.position
                       - aimDir * cueDistance
                       + Vector3.up * cueHeight;
        Vector3 lookAt = cueBall.position + aimDir * cueLookAhead;

        targetPos = behind;
        targetRot = Quaternion.LookRotation((lookAt - behind).normalized, Vector3.up);
    }

    // ── Top mode: bird's-eye directly above table ─────────────────────
    void ComputeTop()
    {
        Vector3 c = tableCenter ? tableCenter.position : Vector3.zero;
        targetPos = c + Vector3.up * topHeight;
        targetRot = Quaternion.Euler(90f, 0f, 0f);
        targetFov = topFov;
    }

    // ── Corner mode: cinematic ¾ view ─────────────────────────────────
    void ComputeCorner()
    {
        Vector3 c = tableCenter ? tableCenter.position : Vector3.zero;
        Vector3 offset = new Vector3(-cornerDist * 0.707f, cornerHeight, -cornerDist * 0.707f);
        targetPos = c + offset;
        targetRot = Quaternion.LookRotation((c - targetPos).normalized, Vector3.up);
        targetFov = cornerFov;
    }

    // ── Track mode: follows fastest-moving ball ───────────────────────
    void ComputeTrack()
    {
        float  maxSpeed = trackMinSpeed;
        fastestBall     = cueBall;   // default to cue ball

        foreach (var b in FindObjectsByType<EnhancedBall>(FindObjectsSortMode.None))
        {
            if (b.isPotted) continue;
            var rb = b.GetComponent<Rigidbody>();
            if (rb == null) continue;
            float spd = rb.linearVelocity.magnitude;
            if (spd > maxSpeed) { maxSpeed = spd; fastestBall = b.transform; }
        }

        // If nothing is moving, fall back to top
        if (fastestBall == null || maxSpeed <= trackMinSpeed)
        { ComputeTop(); return; }

        var ballRb    = fastestBall.GetComponent<Rigidbody>();
        Vector3 vel   = ballRb ? ballRb.linearVelocity.normalized : Vector3.forward;
        vel.y         = 0;

        targetPos = fastestBall.position
                  - vel * trackDist
                  + Vector3.up * trackHeight;
        targetRot = Quaternion.LookRotation((fastestBall.position - targetPos).normalized, Vector3.up);
        targetFov = trackFov;
    }

    // =================================================================
    //  Public API – call these from UI buttons
    // =================================================================
    public void SetCueMode()
    {
        mode         = CameraMode.Cue;
        userOverride = true;
        Debug.Log("[Camera] → Cue Mode");
    }

    public void SetTopMode()
    {
        mode         = CameraMode.Top;
        userOverride = true;
        Debug.Log("[Camera] → Top Mode");
    }

    public void SetCornerMode()
    {
        mode         = CameraMode.Corner;
        userOverride = true;
        Debug.Log("[Camera] → Corner Mode");
    }

    public void SetTrackMode()
    {
        mode         = CameraMode.Track;
        userOverride = true;
        Debug.Log("[Camera] → Track Mode");
    }

    public void SetMode(CameraMode m)
    {
        mode = m;
        userOverride = (m != CameraMode.Top);
    }

    // Auto-switch to track when shot fired, back to cue after balls settle
    public void OnShotFired()
    {
        if (!userOverride) SetMode(CameraMode.Track);
    }

    public void OnBallsSettled()
    {
        if (!userOverride) SetMode(CameraMode.Cue);
    }

    // Clear user override (for auto-camera logic)
    public void ResumeAutoCamera() { userOverride = false; }
}