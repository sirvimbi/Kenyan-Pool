// =====================================================================
//  GameManager.cs  –  Killer Pool · Complete Rules Engine
//  Implements ALL rules from design doc v2.1 exactly
// =====================================================================
using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [Header("Players")]
    public List<Player> players = new List<Player>();
    public int currentTurnIndex = 0;

    [Header("Scene References (auto-assigned by KillerPoolSceneBuilder)")]
    public CueStick         cueStick;
    public CameraController cameraController;
    public UIManager        ui;

    // Ball references
    private List<EnhancedBall> gameBalls   = new List<EnhancedBall>();
    private GameObject         cueBallGO;

    // Per-shot state
    private EnhancedBall       firstBallHit   = null;
    private List<EnhancedBall> pottedThisShot = new List<EnhancedBall>();
    private bool               cueBallPotted  = false;
    private bool               resolveLocked  = false;

    [Header("Economy")]
    public int   stakePerPlayer = 5000;
    public float serviceFee     = 0.10f;
    private int  totalPool, netPool;

    [Header("Physics")]
    public float settleThreshold = 0.04f;
    public float settleInterval  = 0.12f;
    public float settleTimeout   = 12f;
    public float postShotDelay   = 0.6f;

    // Events
    public System.Action<Player>               OnTurnBegin;
    public System.Action<Player, int, bool>    OnScoreChanged;
    public System.Action<string, int>          OnFoul;
    public System.Action<List<EnhancedBall>>   OnCaromScored;
    public System.Action<Player>               OnPlayerBenched;
    public System.Action<Player>               OnPlayerReactivated;
    public System.Action<List<Player>, int>    OnGameOver;
    public System.Action<Player>               OnTargetAdvanced;
    public System.Action                       OnShotFired;
    public System.Action                       OnBallsSettled;

    public enum Phase { Idle, InProgress, RoundOver }
    public Phase CurrentPhase { get; private set; } = Phase.Idle;

    // ── Lifecycle ─────────────────────────────────────────────────────
    void Awake()
    {
        if (Instance != null && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
    }

    void Start()
    {
        if (players.Count == 0) AutoBootstrap();
        RefreshRefs();
        if (players.Count > 0) StartGame(players);
    }

    // ── Public API ────────────────────────────────────────────────────
    public void StartGame(List<Player> list)
    {
        players          = list;
        currentTurnIndex = 0;
        CurrentPhase     = Phase.InProgress;

        stakePerPlayer = PlayerPrefs.GetInt("kp_stake", stakePerPlayer);
        totalPool = stakePerPlayer * players.Count;
        netPool   = Mathf.RoundToInt(totalPool * (1f - serviceFee));
        foreach (var p in players) p.balance -= stakePerPlayer;

        players = players.OrderBy(_ => Random.value).ToList();
        for (int i = 0; i < players.Count; i++) players[i].turnOrder = i;

        RefreshRefs();
        ResetAllBalls();
        BeginTurn();
        Debug.Log($"[GM] Game start | {players.Count}P | pool={totalPool} net={netPool}");
    }

    // ── Shot registration ─────────────────────────────────────────────
    public void RegisterBallHit(EnhancedBall b)
    {
        if (b == null || b.isPotted) return;
        if (firstBallHit == null)
        {
            firstBallHit = b;
            Debug.Log($"[GM] First hit: #{b.ballNumber}");
        }
    }

    public void RegisterPottedBall(EnhancedBall b)
    {
        if (b == null || b.isPotted) return;
        if (!pottedThisShot.Contains(b)) pottedThisShot.Add(b);
        b.PotBall();
    }

    public void RegisterCueBallPotted() { cueBallPotted = true; }

    public void NotifyShotFired()
    {
        if (resolveLocked) return;
        resolveLocked = true;
        OnShotFired?.Invoke();
        StartCoroutine(WaitForSettle());
    }

    // ── Physics settle ────────────────────────────────────────────────
    IEnumerator WaitForSettle()
    {
        yield return new WaitForSeconds(postShotDelay);
        float t = 0;
        while (t < settleTimeout)
        {
            yield return new WaitForSeconds(settleInterval);
            t += settleInterval;
            if (AllStopped()) break;
        }
        OnBallsSettled?.Invoke();
        ResolveShotOutcome();
    }

    bool AllStopped()
    {
        foreach (var rb in FindObjectsByType<Rigidbody>(FindObjectsSortMode.None))
            if (rb.linearVelocity.magnitude > settleThreshold ||
                rb.angularVelocity.magnitude > settleThreshold) return false;
        return true;
    }

    // ── CORE: Shot resolution ─────────────────────────────────────────
    public void ResolveShotOutcome()
    {
        var p   = CurrentPlayer;
        var tgt = GetTarget(p);

        // 1. SCRATCH
        if (cueBallPotted)
        {
            int pen = tgt?.pointValue ?? 0;
            Penalise(p, pen, $"SCRATCH! Cue ball potted. -{pen} pts");
            ResetCueBall();
            NextTurn(false);
            return;
        }

        // 2. WRONG FIRST CONTACT
        if (firstBallHit != null && tgt != null && firstBallHit != tgt)
        {
            int pen = pottedThisShot.Sum(b => b.pointValue);
            Penalise(p, pen, $"FOUL! Hit #{firstBallHit.ballNumber} first. -{pen} pts");
            CheckBench();
            NextTurn(false);
            return;
        }

        // 3. MISS
        if (!pottedThisShot.Any(b => b == tgt))
        {
            Debug.Log($"[GM] {p.playerName} missed");
            CheckBench();
            NextTurn(false);
            return;
        }

        // 4. SUCCESS
        int pts = tgt.pointValue;
        var caroms = pottedThisShot.Where(b => b != tgt).ToList();
        if (caroms.Count > 0)
        {
            int bonus = caroms.Sum(b => b.pointValue);
            pts += bonus;
            OnCaromScored?.Invoke(caroms);
            Debug.Log($"[GM] CAROM +{bonus} ({string.Join(",", caroms.Select(b => "#" + b.ballNumber))})");
        }

        p.AddPoints(pts);
        OnScoreChanged?.Invoke(p, pts, caroms.Count > 0);
        p.AdvanceToNextTarget();
        OnTargetAdvanced?.Invoke(p);

        if (gameBalls.All(b => b.isPotted)) { GameOver(); return; }
        CheckBench();
        NextTurn(true);
    }

    // ── Bench rule ────────────────────────────────────────────────────
    void CheckBench()
    {
        int leader   = players.Max(p => p.score);
        int remValue = gameBalls.Where(b => !b.isPotted).Sum(b => b.pointValue);

        foreach (var p in players)
        {
            int potMax = p.score + remValue;
            if (potMax < leader && !p.isBenched)
            {
                p.isBenched = true;
                OnPlayerBenched?.Invoke(p);
                Debug.Log($"[GM] {p.playerName} BENCHED (max {potMax} < {leader})");
            }
            else if (potMax >= leader && p.isBenched)
            {
                p.isBenched = false;
                OnPlayerReactivated?.Invoke(p);
                Debug.Log($"[GM] {p.playerName} REACTIVATED");
            }
        }
    }

    // ── Game Over & Payout ────────────────────────────────────────────
    void GameOver()
    {
        CurrentPhase = Phase.RoundOver;
        int top     = players.Max(p => p.score);
        var winners = players.Where(p => p.score == top).ToList();
        int each    = netPool / Mathf.Max(1, winners.Count);
        foreach (var w in winners)
        {
            w.balance += each;
            Debug.Log($"[GM] Winner: {w.playerName} +{each} KSh");
        }
        OnGameOver?.Invoke(winners, netPool);
    }

    // ── Turn helpers ──────────────────────────────────────────────────
    void BeginTurn()
    {
        for (int g = 0; g < players.Count; g++)
        {
            if (!CurrentPlayer.isBenched) break;
            currentTurnIndex = (currentTurnIndex + 1) % players.Count;
        }
        ResetShot();

        var stick = cueStick != null ? cueStick : FindFirstObjectByType<CueStick>();
        stick?.EnableShot();

        OnTurnBegin?.Invoke(CurrentPlayer);
        Debug.Log($"[GM] Turn -> {CurrentPlayer.playerName}  target #{CurrentPlayer.currentTargetBallNumber}");

        if (CurrentPlayer.isAI)
        {
            var ai = FindFirstObjectByType<AIOpponent>();
            ai?.TakeTurn(CurrentPlayer, gameBalls.Where(b => !b.isPotted).ToList());
        }
    }

    void NextTurn(bool extra)
    {
        resolveLocked = false;
        if (!extra || CurrentPlayer.isBenched)
            currentTurnIndex = (currentTurnIndex + 1) % players.Count;
        BeginTurn();
    }

    void Penalise(Player p, int pen, string msg)
    {
        p.SubtractPoints(pen);
        OnFoul?.Invoke(msg, pen);
        OnScoreChanged?.Invoke(p, -pen, false);
    }

    // ── Helpers ───────────────────────────────────────────────────────
    EnhancedBall GetTarget(Player p) =>
        gameBalls.FirstOrDefault(b => b.ballNumber == p.currentTargetBallNumber && !b.isPotted);

    void ResetShot()
    {
        firstBallHit = null;
        pottedThisShot.Clear();
        cueBallPotted = false;
    }

    void RefreshRefs()
    {
        gameBalls = FindObjectsByType<EnhancedBall>(FindObjectsSortMode.None)
            .Where(b => b.ballNumber >= 3 && b.ballNumber <= 15)
            .OrderBy(b => b.ballNumber).ToList();
        cueBallGO = GameObject.FindGameObjectWithTag("CueBall");
    }

    void ResetAllBalls()
    {
        foreach (var b in gameBalls) b.ResetBall();
        FindFirstObjectByType<BallSetup>()?.Build();
        RefreshRefs();
        ResetCueBall();
    }

    void ResetCueBall()
    {
        if (!cueBallGO) cueBallGO = GameObject.FindGameObjectWithTag("CueBall");
        if (!cueBallGO) return;
        var rb = cueBallGO.GetComponent<Rigidbody>();
        if (rb)
        {
            rb.isKinematic = false;
            rb.linearVelocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
        }
        var s = FindFirstObjectByType<BallSetup>();
        if (s)
            cueBallGO.transform.position = new Vector3(
                -s.tableLength * 0.25f,
                (s.tableSurface ? s.tableSurface.position.y : s.clothY) + s.ballRadius,
                0f);
    }

    void AutoBootstrap()
    {
        int ai = PlayerPrefs.GetInt("kp_vsAI", 1);
        players.Add(new Player("p1", "Player 1", 0, false));
        players.Add(new Player("p2", ai == 1 ? "Computer" : "Player 2", 1, ai == 1));
        Debug.Log($"[GM] Auto-bootstrapped 2 players (vsAI={ai})");
    }

    // ── Public accessors ──────────────────────────────────────────────
    public Player       CurrentPlayer      => players.Count > 0 ? players[currentTurnIndex] : null;
    public int          NetPool            => netPool;
    public int          TotalPool          => totalPool;
    public int          RemainingBallValue => gameBalls.Where(b => !b.isPotted).Sum(b => b.pointValue);
    public int          ActiveBallCount    => gameBalls.Count(b => !b.isPotted);
    public List<Player> GetLeaderboard()   => players.OrderByDescending(p => p.score).ToList();

    // ── UIManager compatibility shims ─────────────────────────────────
    public void StartTurn() => BeginTurn();

    public void QuitToLobby()
    {
        CurrentPhase = Phase.Idle;
        UnityEngine.SceneManagement.SceneManager.LoadScene("Lobby");
    }

    public int PrizePool => netPool;

    public int currentPlayerIdx
    {
        get => currentTurnIndex;
        set => currentTurnIndex = value;
    }

    // ── New Round ─────────────────────────────────────────────────────
    public void NewRound()
    {
        foreach (var p in players)
        {
            p.score                   = 0;
            p.currentTargetBallNumber = 3;
            p.isBenched               = false;
        }
        StartGame(players);
    }
}