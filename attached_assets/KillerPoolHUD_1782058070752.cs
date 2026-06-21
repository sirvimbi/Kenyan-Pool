// =====================================================================
//  KillerPoolHUD.cs  –  Complete in-game UI
//  Attach to a Canvas or empty GameObject.
//  Subscribes to GameManager events and drives all on-screen elements.
//  Uses TMPro; falls back to UI.Text if TMPro unavailable.
// =====================================================================
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

public class KillerPoolHUD : MonoBehaviour
{
    // ── Inspector refs (wire in Unity) ────────────────────────────────
    [Header("Target Display")]
    public TMP_Text targetLabel;        // "TARGET: #7  (7 pts)"
    public Image    targetBallIcon;
    public TMP_Text pointsRemainingLabel;

    [Header("Active Player")]
    public TMP_Text activePlayerLabel;  // "PLAYER 1'S TURN"
    public TMP_Text activeScoreLabel;
    public Image    benchedOverlay;     // full-screen semi-transparent red
    public TMP_Text benchedText;        // "BENCHED"

    [Header("Leaderboard Panel")]
    public Transform leaderboardContainer;  // vertical layout group
    public GameObject leaderboardRowPrefab; // prefab with 3 TMP_Text components

    [Header("Notification Banner")]
    public GameObject notifBanner;          // slides in/out
    public TMP_Text   notifText;
    public Image      notifBackground;
    public float      notifDuration = 2.8f;

    [Header("Carom Popup")]
    public GameObject caromPopup;
    public TMP_Text   caromText;            // "CAROM! +10 +15"
    public float      caromDuration = 2.2f;

    [Header("Timer Ring (Matchmaking)")]
    public Image    timerRingFill;
    public TMP_Text timerText;

    [Header("Round End Screen")]
    public GameObject roundEndPanel;
    public TMP_Text   roundEndTitle;        // "VICTORY!" / "TIE GAME!"
    public TMP_Text   roundEndDetails;      // payout breakdown
    public Button     continueBtn;
    public Button     quitBtn;

    [Header("Camera Mode Buttons")]
    public Button camCueBtn;
    public Button camTopBtn;
    public Button camCornerBtn;
    public Button camTrackBtn;

    [Header("Economy Strip")]
    public TMP_Text prizePoolLabel;         // "Prize Pool: 18,000 KSh"

    // ── Internal ──────────────────────────────────────────────────────
    private GameManager    gm;
    private CameraController cam;
    private Coroutine      notifRoutine;
    private Coroutine      caromRoutine;
    private List<GameObject> lbRows = new List<GameObject>();

    // ── Colour constants ──────────────────────────────────────────────
    static readonly Color ColSuccess = new Color(0.15f, 0.85f, 0.30f);
    static readonly Color ColFoul    = new Color(0.92f, 0.18f, 0.18f);
    static readonly Color ColCarom   = new Color(0.96f, 0.78f, 0.08f);
    static readonly Color ColBenched = new Color(0.55f, 0.55f, 0.55f);
    static readonly Color ColGold    = new Color(1.00f, 0.80f, 0.15f);

    // =================================================================
    void Awake()
    {
        HideAll();
    }

    void Start()
    {
        gm  = GameManager.Instance ?? FindFirstObjectByType<GameManager>();
        cam = FindFirstObjectByType<CameraController>();

        if (gm == null) { Debug.LogError("[HUD] GameManager not found!"); return; }

        // Subscribe to events
        gm.OnTurnBegin        += HandleTurnBegin;
        gm.OnScoreChanged     += HandleScoreChanged;
        gm.OnFoul             += HandleFoul;
        gm.OnCaromScored      += HandleCarom;
        gm.OnPlayerBenched    += HandleBenched;
        gm.OnPlayerReactivated+= HandleReactivated;
        gm.OnGameOver         += HandleGameOver;
        gm.OnTargetAdvanced   += HandleTargetAdvanced;

        // Camera buttons
        WireButton(camCueBtn,    () => cam?.SetCueMode());
        WireButton(camTopBtn,    () => cam?.SetTopMode());
        WireButton(camCornerBtn, () => cam?.SetCornerMode());
        WireButton(camTrackBtn,  () => cam?.SetTrackMode());

        // Round-end buttons
        WireButton(continueBtn, () => { roundEndPanel?.SetActive(false); gm.NewRound(); });
        WireButton(quitBtn,     () => UnityEngine.SceneManagement.SceneManager.LoadScene("Lobby"));

        // Initial state
        RefreshPrizePool();
        RefreshLeaderboard();
        if (roundEndPanel) roundEndPanel.SetActive(false);
    }

    void OnDestroy()
    {
        if (gm == null) return;
        gm.OnTurnBegin         -= HandleTurnBegin;
        gm.OnScoreChanged      -= HandleScoreChanged;
        gm.OnFoul              -= HandleFoul;
        gm.OnCaromScored       -= HandleCarom;
        gm.OnPlayerBenched     -= HandleBenched;
        gm.OnPlayerReactivated -= HandleReactivated;
        gm.OnGameOver          -= HandleGameOver;
        gm.OnTargetAdvanced    -= HandleTargetAdvanced;
    }

    // =================================================================
    //  Event Handlers
    // =================================================================
    void HandleTurnBegin(Player p)
    {
        SetText(activePlayerLabel, $"{p.playerName.ToUpper()}'S TURN{(p.isAI ? " (AI)" : "")}");
        SetText(activeScoreLabel, $"Score: {p.score}");
        RefreshTargetDisplay(p);
        RefreshLeaderboard();
        SetBenchedOverlay(false);
    }

    void HandleScoreChanged(Player p, int delta, bool isCarom)
    {
        SetText(activeScoreLabel, $"Score: {p.score}");
        RefreshLeaderboard();

        if (!isCarom && delta > 0)
            ShowNotif($"+{delta} pts", ColSuccess);
        else if (delta < 0)
            ShowNotif($"{delta} pts", ColFoul);
    }

    void HandleFoul(string msg, int penalty)
    {
        ShowNotif(msg, ColFoul);
        Debug.Log($"[HUD] Foul: {msg}");
    }

    void HandleCarom(List<EnhancedBall> balls)
    {
        int total = balls.Sum(b => b.pointValue);
        string bonusStr = string.Join("  ", balls.Select(b => $"+{b.pointValue}"));
        ShowCaromPopup($"CAROM!  {bonusStr}  =  +{total} BONUS");
    }

    void HandleBenched(Player p)
    {
        ShowNotif($"{p.playerName} BENCHED", ColBenched);
        if (p == gm.CurrentPlayer) SetBenchedOverlay(true);
        RefreshLeaderboard();
    }

    void HandleReactivated(Player p)
    {
        ShowNotif($"{p.playerName} BACK IN PLAY", ColSuccess);
        RefreshLeaderboard();
    }

    void HandleTargetAdvanced(Player p)
    {
        RefreshTargetDisplay(p);
    }

    void HandleGameOver(List<Player> winners, int netPrize)
    {
        if (!roundEndPanel) return;
        roundEndPanel.SetActive(true);

        bool tie = winners.Count > 1;
        if (tie)
        {
            SetText(roundEndTitle, "TIE GAME!");
            int each = netPrize / winners.Count;
            string names = string.Join(" & ", winners.Select(w => w.playerName));
            SetText(roundEndDetails,
                $"Tied: {names}\n" +
                $"Net Pool: {netPrize:N0} KSh\n" +
                $"Split {winners.Count} ways\n" +
                $"Each wins: {each:N0} KSh");
        }
        else
        {
            SetText(roundEndTitle, "VICTORY!");
            SetText(roundEndDetails,
                $"Winner: {winners[0].playerName}\n" +
                $"Score: {winners[0].score} pts\n" +
                $"Prize: {netPrize:N0} KSh");
        }
    }

    // =================================================================
    //  Target display
    // =================================================================
    void RefreshTargetDisplay(Player p)
    {
        if (!p.HasCompletedAllBalls())
        {
            int pts = (p.currentTargetBallNumber == 3) ? 6 : p.currentTargetBallNumber;
            SetText(targetLabel, $"TARGET:  #{p.currentTargetBallNumber}  ({pts} pts)");
            SetText(pointsRemainingLabel, $"Balls left: {gm.ActiveBallCount}  |  Remaining value: {gm.RemainingBallValue} pts");
        }
        else
        {
            SetText(targetLabel, "ALL BALLS POTTED!");
        }
    }

    // =================================================================
    //  Leaderboard
    // =================================================================
    void RefreshLeaderboard()
    {
        if (!leaderboardContainer) return;
        var board = gm.GetLeaderboard();

        // Ensure row count matches
        while (lbRows.Count < board.Count)
        {
            var row = leaderboardRowPrefab
                ? Instantiate(leaderboardRowPrefab, leaderboardContainer)
                : CreateDefaultRow(leaderboardContainer);
            lbRows.Add(row);
        }

        for (int i = 0; i < board.Count; i++)
        {
            var p    = board[i];
            var row  = lbRows[i];
            var txts = row.GetComponentsInChildren<TMP_Text>();

            string bench  = p.isBenched ? " [BENCHED]" : "";
            string ai     = p.isAI      ? " (AI)"      : "";
            string active = (p == gm.CurrentPlayer) ? "▶ " : "   ";
            int potMax    = p.score + gm.RemainingBallValue;

            if (txts.Length >= 3)
            {
                txts[0].text  = $"{active}{i + 1}. {p.playerName}{ai}{bench}";
                txts[1].text  = $"{p.score} pts";
                txts[2].text  = $"max {potMax}";
                txts[0].color = p.isBenched ? ColBenched : (p == gm.CurrentPlayer ? ColGold : Color.white);
            }
            else if (txts.Length == 1)
            {
                txts[0].text = $"{active}{i + 1}. {p.playerName}{ai}  {p.score}{bench}";
            }
        }
    }

    GameObject CreateDefaultRow(Transform parent)
    {
        var row = new GameObject("LBRow");
        row.transform.SetParent(parent, false);
        var txt = row.AddComponent<TMP_Text>();
        txt.fontSize = 18;
        txt.color    = Color.white;
        return row;
    }

    // =================================================================
    //  Notification banner
    // =================================================================
    void ShowNotif(string msg, Color col)
    {
        if (!notifBanner) return;
        SetText(notifText, msg);
        if (notifBackground) notifBackground.color = col;
        if (notifRoutine != null) StopCoroutine(notifRoutine);
        notifRoutine = StartCoroutine(NotifRoutine());
    }

    IEnumerator NotifRoutine()
    {
        notifBanner.SetActive(true);
        yield return new WaitForSeconds(notifDuration);
        notifBanner.SetActive(false);
    }

    // =================================================================
    //  Carom popup
    // =================================================================
    void ShowCaromPopup(string msg)
    {
        if (!caromPopup) return;
        SetText(caromText, msg);
        if (caromText) caromText.color = ColCarom;
        if (caromRoutine != null) StopCoroutine(caromRoutine);
        caromRoutine = StartCoroutine(CaromRoutine());
    }

    IEnumerator CaromRoutine()
    {
        caromPopup.SetActive(true);
        float t = 0;
        Vector3 start = caromPopup.transform.localPosition;
        while (t < caromDuration)
        {
            t += Time.deltaTime;
            // Float upward
            caromPopup.transform.localPosition = start + Vector3.up * (t * 40f);
            if (caromText) caromText.color = new Color(ColCarom.r, ColCarom.g, ColCarom.b,
                Mathf.Clamp01(1f - (t / caromDuration - 0.5f) * 3f));
            yield return null;
        }
        caromPopup.SetActive(false);
        caromPopup.transform.localPosition = start;
    }

    // =================================================================
    //  Utilities
    // =================================================================
    void SetBenchedOverlay(bool show)
    {
        if (benchedOverlay) benchedOverlay.gameObject.SetActive(show);
        if (benchedText)    benchedText.gameObject.SetActive(show);
    }

    void RefreshPrizePool()
    {
        if (!prizePoolLabel || gm == null) return;
        SetText(prizePoolLabel, $"Prize Pool: {gm.NetPool:N0} KSh");
    }

    void HideAll()
    {
        if (notifBanner)    notifBanner.SetActive(false);
        if (caromPopup)     caromPopup.SetActive(false);
        if (benchedOverlay) benchedOverlay.gameObject.SetActive(false);
        if (benchedText)    benchedText.gameObject.SetActive(false);
        if (roundEndPanel)  roundEndPanel.SetActive(false);
    }

    static void SetText(TMP_Text t, string s) { if (t) t.text = s; }

    static void WireButton(Button b, System.Action a)
    {
        if (b == null) return;
        b.onClick.RemoveAllListeners();
        b.onClick.AddListener(() => a?.Invoke());
    }
}