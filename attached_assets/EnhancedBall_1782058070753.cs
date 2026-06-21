using UnityEngine;
using System.Collections;

[System.Serializable]
public class EnhancedBall : MonoBehaviour
{
    [Header("Ball Properties")]
    public int  ballNumber;
    public int  pointValue;
    public bool isPotted = false;

    [Header("Visual References")]
    public MeshRenderer  ballRenderer;
    public Material      pottedMaterial;
    public ParticleSystem hitParticles;
    public ParticleSystem pottedParticles;

    [Header("Audio")]
    public AudioClip hitSound;
    public AudioClip pocketSound;

    private Vector3    initialPosition;
    private Quaternion initialRotation;
    private Rigidbody  rb;
    private AudioSource audioSource;
    private float lastHitTime;

    void Awake()
    {
        rb = GetComponent<Rigidbody>();
        if (rb == null) rb = gameObject.AddComponent<Rigidbody>();

        rb.mass           = 0.17f;
        rb.linearDamping  = 0.2f;
        rb.angularDamping = 0.05f;
        rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        rb.maxAngularVelocity     = 15f;

        var col = GetComponent<Collider>();
        if (col != null)
        {
            var mat = new PhysicsMaterial("BallMaterial");
            mat.bounciness      = 0.85f;
            mat.dynamicFriction = 0.3f;
            mat.staticFriction  = 0.4f;
            col.material = mat;
        }

        initialPosition = transform.position;
        initialRotation = transform.rotation;

        if (ballRenderer == null) ballRenderer = GetComponent<MeshRenderer>();

        audioSource = GetComponent<AudioSource>();
        if (audioSource == null) audioSource = gameObject.AddComponent<AudioSource>();
        audioSource.spatialBlend = 1f;
        audioSource.minDistance  = 1f;
        audioSource.maxDistance  = 15f;
    }

    void Start()
    {
        if (ballNumber >= 3 && ballNumber <= 15)
        {
            pointValue = (ballNumber == 3) ? 6 : ballNumber;
            Debug.Log($"Ball {ballNumber} initialized with {pointValue} points");
        }
        else if (ballNumber == 0)
        {
            Debug.Log("Cue ball initialized");
        }
        else
        {
            Debug.LogWarning($"Ball {ballNumber} is not used in Kenyan Pool");
        }
    }

    public void PotBall()
    {
        if (isPotted) return;
        isPotted = true;

        if (pottedParticles != null) pottedParticles.Play();
        if (pocketSound != null && audioSource != null) audioSource.PlayOneShot(pocketSound);
        if (ballRenderer != null) ballRenderer.enabled = false;

        if (rb != null)
        {
            // ── IMPORTANT: zero velocities BEFORE setting isKinematic ──────────
            // Unity does not allow setting velocity on a kinematic body.
            // Reversing this order was causing the "Setting linear velocity of a
            // kinematic body is not supported" warnings.
            rb.linearVelocity  = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
            rb.isKinematic     = true;
        }

        Debug.Log($"Ball {ballNumber} potted! Worth {pointValue} points");
    }

    public void ResetBall()
    {
        isPotted = false;
        transform.position = initialPosition;
        transform.rotation = initialRotation;

        if (ballRenderer != null) ballRenderer.enabled = true;

        if (rb != null)
        {
            rb.isKinematic     = false;
            rb.linearVelocity  = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
        }

        Debug.Log($"Ball {ballNumber} reset");
    }

    void OnCollisionEnter(Collision collision)
    {
        if (Time.time - lastHitTime < 0.05f) return;
        lastHitTime = Time.time;

        if (hitSound != null && audioSource != null)
        {
            float vol = Mathf.Clamp01(collision.relativeVelocity.magnitude / 10f);
            audioSource.PlayOneShot(hitSound, vol * 0.5f);
        }

        if (hitParticles != null && collision.contacts.Length > 0)
        {
            var ps = SimplePool.Spawn(
                hitParticles.gameObject,
                collision.contacts[0].point,
                Quaternion.identity).GetComponent<ParticleSystem>();
            if (ps != null)
            {
                ps.Play();
                StartCoroutine(DespawnAfter(ps, ps.main.duration));
            }
        }

        if (gameObject.CompareTag("CueBall"))
        {
            var hitBall = collision.gameObject.GetComponent<EnhancedBall>();
            if (hitBall != null && !hitBall.isPotted)
                GameManager.Instance?.RegisterBallHit(hitBall);
        }
    }

    IEnumerator DespawnAfter(ParticleSystem ps, float delay)
    {
        yield return new WaitForSeconds(delay);
        if (ps != null) SimplePool.Despawn(ps.gameObject);
    }

    public string GetBallInfo() =>
        $"Ball {ballNumber} (Value: {pointValue}) - {(isPotted ? "Potted" : "On Table")}";
}