using UnityEngine;

public class CueStick : MonoBehaviour
{
    [Header("References")]
    public Transform cueBall;
    public Transform stickModel;
    public Camera mainCam;

    [Header("Aim (read-only)")]
    public float AimAngleRad { get; private set; } = 0f;
    public bool CanShoot = true;
    public bool IsCharging = false;

    [Header("Power")]
    [Range(0, 1)] public float power = 0f;
    public float chargeRate = 1.2f;
    public float maxImpulse = 7.5f;         // increased for better feel

    [Header("Visual Offsets (to avoid clipping)")]
    public float idleOffset = 0.32f;         // was 0.25 – increase if still clips
    public float chargeOffset = 0.72f;

    private Rigidbody cueRb;
    private Vector3 stickHomeLocal;

    void Start()
    {
        if (cueBall) cueRb = cueBall.GetComponent<Rigidbody>();
        if (stickModel) stickHomeLocal = stickModel.localPosition;
        // Raise stick pivot to avoid table penetration
        if (stickModel)
        {
            Vector3 pos = stickModel.localPosition;
            pos.y = 0.05f;   // slight above table surface
            stickModel.localPosition = pos;
        }
    }

    void Update()
    {
        if (!cueBall) return;
        UpdateAim();
        UpdateCharge();
        PoseStick();
    }

    void UpdateAim()
    {
        if (!mainCam) mainCam = Camera.main;
        if (!mainCam) return;

        Plane plane = new Plane(Vector3.up, cueBall.position);
        Ray ray = mainCam.ScreenPointToRay(Input.mousePosition);
        if (plane.Raycast(ray, out float t))
        {
            Vector3 hit = ray.GetPoint(t);
            Vector3 dir = (hit - cueBall.position);
            dir.y = 0;
            if (dir.sqrMagnitude > 0.001f)
                AimAngleRad = Mathf.Atan2(dir.z, dir.x);
        }
    }

    void UpdateCharge()
    {
        bool held = Input.GetKey(KeyCode.Space) || Input.GetMouseButton(0);
        if (!CanShoot)
        {
            IsCharging = false;
            power = 0f;
            return;
        }
        if (held)
        {
            IsCharging = true;
            power = Mathf.Min(1f, power + Time.deltaTime * chargeRate);
        }
        else if (IsCharging)
        {
            Shoot();
            IsCharging = false;
        }
    }

    public void Shoot()
    {
        if (!cueRb || power <= 0.05f) { power = 0; return; }
        Vector3 dir = new Vector3(Mathf.Cos(AimAngleRad), 0, Mathf.Sin(AimAngleRad));
        cueRb.AddForce(dir * power * maxImpulse, ForceMode.Impulse);
        power = 0f;
        CanShoot = false;
        GameManager.Instance?.NotifyShotFired();
    }

    // 🔧 NEW: Called by AI opponent
    public void SetAimDirection(Vector3 dir)
    {
        AimAngleRad = Mathf.Atan2(dir.z, dir.x);
    }

    // 🔧 NEW: AI force shoot (bypass charge)
    public void ForceShoot(float powerAmount)
    {
        if (!cueRb) return;
        Vector3 dir = new Vector3(Mathf.Cos(AimAngleRad), 0, Mathf.Sin(AimAngleRad));
        cueRb.AddForce(dir * powerAmount, ForceMode.Impulse);
        CanShoot = false;
        GameManager.Instance?.NotifyShotFired();
    }

    public void EnableShot() { CanShoot = true; }

    void PoseStick()
    {
        if (!stickModel || !cueBall) return;
        Vector3 dir = new Vector3(Mathf.Cos(AimAngleRad), 0, Mathf.Sin(AimAngleRad));
        float offset = Mathf.Lerp(idleOffset, chargeOffset, power);
        stickModel.position = cueBall.position - dir * offset;
        // raise stick Y so it doesn't dig into table
        Vector3 pos = stickModel.position;
        pos.y = cueBall.position.y + 0.03f;
        stickModel.position = pos;
        stickModel.rotation = Quaternion.LookRotation(dir, Vector3.up);
    }
}