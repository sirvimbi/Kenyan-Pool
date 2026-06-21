using UnityEngine;

public class CameraZone : MonoBehaviour
{
    public CameraController.CameraMode cameraModeOnEnter = CameraController.CameraMode.Cue;
    public float stayDuration = 2f;
    public bool revertOnExit = true;

    private CameraController cameraController;
    private bool isInZone = false;
    private float enterTime;

    void Start()
    {
        cameraController = FindFirstObjectByType<CameraController>();
    }

    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("CueBall") && cameraController != null)
        {
            isInZone = true;
            enterTime = Time.time;
            cameraController.SetMode(cameraModeOnEnter);
        }
    }

    void OnTriggerStay(Collider other)
    {
        if (isInZone && cameraController != null)
        {
            if (revertOnExit && Time.time - enterTime > stayDuration)
            {
                cameraController.SetCueMode();
                isInZone = false;
            }
        }
    }

    void OnTriggerExit(Collider other)
    {
        if (other.CompareTag("CueBall") && cameraController != null && revertOnExit)
        {
            cameraController.SetCueMode();
            isInZone = false;
        }
    }
}