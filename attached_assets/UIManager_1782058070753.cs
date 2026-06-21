// =====================================================================
//  UIManager.cs  –  Killer Pool · In-Game HUD
//  Field names match what KillerPoolSceneBuilder assigns at lines 706-715.
// =====================================================================
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

public class UIManager : MonoBehaviour
{
    // ── Singleton ─────────────────────────────────────────────────────
    public static UIManager Instance { get; private set; }

    // ── Fields assigned by KillerPoolSceneBuilder (lines 706-715) ─────
    [Header("Scene Builder Assigned Fields")]
    public TMP_Text turnTimerText;       // line 706
    public TMP_Text currentPlayerText;   // line 707
    public TMP_Text prizePoolText;       // line 708
    public TMP_Text targetBallText;      // line 709
    public TMP_Text scoreText;           // line 710
    public Button   cueCamBtn;           // line 712
    public Button   topCamBtn;           // line 713
    public Button   cornerCamBtn;        // line 714
    public Button   trackCamBtn;         // line 715

    // ── Additional inspector refs ─────────────────────────────────────
    [Header("Target Display")]
    public TMP_Text targetLabel;
    public TMP_Text remainingValueLabel;

    [Header("Active Player")]
    public TMP_Text   activePlayerLabel;
    public TMP_Text   activeScoreLabel;
    public GameObject benchedOverlay;
    public TMP_Text   benchedLabel;

    [Header("Leaderboard")]
    public Transform  leaderboardContainer;
    public GameObject leaderboardRowPrefab;

    [Header("Notification Banner")]
    public GameObject notifBanner;
    public TMP_Text   notifText;
    public Image      notifBg;
    public float      notifDuration = 2.8f;

    [Header("Carom Popup")]
    public GameObject caromPopup;
    public TMP_Text   caromText;
    public float      caromDuration = 2.2f;

    [Header("Round End Screen")]
    public GameObject roundEndPanel;
    public TMP_Text   roundEndTitle;
    public TMP_Text   roundEndDetails;
    public Button     continueButton;
    public Button     quitButton;

    [Header("Economy")]
    public TMP_Text prizePoolLabel;

    [Header("Matchmaking")]
    public TMP_Text timerText;
    public Image    timerRingFill;

    // ── Colours ───────────────────────────────────────────────────────
    static readonly Color ColSuccess = new Color(0.15f, 0.85f, 0.30f);
    static readonly Color ColFoul    = new Color(0.92f, 0.18f, 0.18f);
    static readonly Color ColCarom   = new Color(0.96f, 0.78f, 0.08f);
    static readonly Color ColBenched = new Color(0.55f, 0.55f, 0.55f);
    static readonly Color ColGold    = new Color(1.00f, 0.80f, 0.15f);

    // ── Internal ──────────────────────────────────────────────────────
    private GameManager      gm;
    private CameraController cam;
    private List<GameObject> lbRows  = new List<GameObject>();
    private Coroutine        notifCo;
    private Coroutine        caromCo;

    // =================================================================
    //  Lifecycle
    // =================================================================
    void Awake()
    {
        if (Instance != null && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
    }

    void Start()
    {
        gm  = GameManager.Instance ?? FindFirstObjectByType<GameManager>();
        cam = FindFirstObjectByType<CameraController>();

        if (gm == null) { Debug.LogError("[UIManager] GameManager not found."); return; }

        SubscribeEvents();
        WireButtons();
        HideAll();
        RefreshPrizePool();
    }

    void OnDestroy() => UnsubscribeEvents();

    // =================================================================
    //  Event subscription
    // =================================================================
    void SubscribeEvents()
    {
        gm.OnTurnBegin         += OnTurnBegin;
        gm.OnScoreChanged      += OnScoreChanged;
        gm.OnFoul              += OnFoul;
        gm.OnCaromScored       += OnCarom;
        gm.OnPlayerBenched     += OnBenched;
        gm.OnPlayerReactivated += OnReactivated;
        gm.OnGameOver          += OnGameOver;
        gm.OnTargetAdvanced    += OnTargetAdvanced;
    }

    void UnsubscribeEvents()
    {
        if (gm == null) return;
        gm.OnTurnBegin         -= OnTurnBegin;
        gm.OnScoreChanged      -= OnScoreChanged;
        gm.OnFoul              -= OnFoul;
        gm.OnCaromScored       -= OnCarom;
        gm.OnPlayerBenched     -= OnBenched;
        gm.OnPlayerReactivated -= OnReactivated;
        gm.OnGameOver          -= OnGameOver;
        gm.OnTargetAdvanced    -= OnTargetAdvanced;
    }

    // =================================================================
    //  Button wiring — uses both naming conventions
    // =================================================================
    void WireButtons()
    {
        // Scene-builder assigned names (cueCamBtn, topCamBtn, etc.)
        Wire(cueCamBtn,    () => cam?.SetCueMode());
        Wire(topCamBtn,    () => cam?.SetTopMode());
        Wire(cornerCamBtn, () => cam?.SetCornerMode());
        Wire(trackCamBtn,  () => cam?.SetTrackMode());

        // Inspector assigned names (camCueBtn, camTopBtn, etc.)
        Wire(camCueBtn,    () => cam?.SetCueMode());
        Wire(camTopBtn,    () => cam?.SetTopMode());
        Wire(camCornerBtn, () => cam?.SetCornerMode());
        Wire(camTrackBtn,  () => cam?.SetTrackMode());

        Wire(continueButton, OnContinueClicked);
        Wire(quitButton,     OnQuitClicked);
    }

    // Duplicate inspector refs for both naming conventions
    [Header("Camera Buttons (alternate naming)")]
    public Button camCueBtn;
    public Button camTopBtn;
    public Button camCornerBtn;
    public Button camTrackBtn;

    static void Wire(Button b, System.Action a)
    {
        if (b == null) return;
        b.onClick.RemoveAllListeners();
        b.onClick.AddListener(() => a?.Invoke());
    }

    // =================================================================
    //  GameManager event handlers
    // =================================================================
    void OnTurnBegin(Player p)
    {
        string label = $"{p.playerName.ToUpper()}'S TURN{(p.isAI ? " (AI)" : "")}";
        SetText(activePlayerLabel,  label);
        SetText(currentPlayerText,  label);        // scene-builder field alias
        SetText(activeScoreLabel,   $"Score: {p.score}");
        SetText(scoreText,          $"Score: {p.score}");  // scene-builder alias
        RefreshTargetDisplay(p);
        RefreshLeaderboard();
        ShowBenchedOverlay(false);
    }

    void OnScoreChanged(Player p, int delta, bool isCarom)
    {
        SetText(activeScoreLabel, $"Score: {p.score}");
        SetText(scoreText,        $"Score: {p.score}");
        RefreshLeaderboard();
        if (!isCarom && delta > 0) ShowNotif($"+{delta} pts", ColSuccess);
        else if (delta < 0)        ShowNotif($"{delta} pts",  ColFoul);
    }

    void OnFoul(string message, int penalty) => ShowNotif(message, ColFoul);

    void OnCarom(List<EnhancedBall> balls)
    {
        int    total = balls.Sum(b => b.pointValue);
        string str   = string.Join("  ", balls.Select(b => $"+{b.pointValue}"));
        ShowCaromPopup($"CAROM!  {str}  =  +{total} BONUS");
    }

    void OnBenched(Player p)
    {
        ShowNotif($"{p.playerName} BENCHED", ColBenched);
        if (p == gm.CurrentPlayer) ShowBenchedOverlay(true);
        RefreshLeaderboard();
    }

    void OnReactivated(Player p)
    {
        ShowNotif($"{p.playerName} BACK IN PLAY", ColSuccess);
        RefreshLeaderboard();
    }

    void OnTargetAdvanced(Player p) => RefreshTargetDisplay(p);

    void OnGameOver(List<Player> winners, int net)
    {
        if (roundEndPanel == null) return;
        roundEndPanel.SetActive(true);

        if (winners.Count > 1)
        {
            SetText(roundEndTitle, "TIE GAME!");
            int    each  = net / winners.Count;
            string names = string.Join(" & ", winners.Select(w => w.playerName));
            SetText(roundEndDetails,
                $"Tied: {names}\nNet Pool: {net:N0} KSh\n" +
                $"Split {winners.Count} ways\nEach wins: {each:N0} KSh");
        }
        else
        {
            SetText(roundEndTitle, "VICTORY!");
            SetText(roundEndDetails,
                $"Winner: {winners[0].playerName}\n" +
                $"Score: {winners[0].score} pts\nPrize: {net:N0} KSh");
        }
    }

    // =================================================================
    //  Target display
    // =================================================================
    void RefreshTargetDisplay(Player p)
    {
        string text;
        if (p.HasCompletedAllBalls())
        {
            text = "ALL BALLS POTTED!";
        }
        else
        {
            int pts = (p.currentTargetBallNumber == 3) ? 6 : p.currentTargetBallNumber;
            text = $"TARGET:  #{p.currentTargetBallNumber}  ({pts} pts)";
        }

        SetText(targetLabel,     text);
        SetText(targetBallText,  text);   // scene-builder alias

        string remaining = $"Balls left: {gm.ActiveBallCount}  |  Remaining: {gm.RemainingBallValue} pts";
        SetText(remainingValueLabel, remaining);
    }

    // =================================================================
    //  Leaderboard
    // =================================================================
    void RefreshLeaderboard()
    {
        if (leaderboardContainer == null || gm == null) return;

        var board = gm.GetLeaderboard();

        while (lbRows.Count < board.Count)
        {
            var row = leaderboardRowPrefab
                ? Instantiate(leaderboardRowPrefab, leaderboardContainer)
                : MakeDefaultRow(leaderboardContainer);
            lbRows.Add(row);
        }

        for (int i = 0; i < board.Count; i++)
        {
            var    p      = board[i];
            var    txts   = lbRows[i].GetComponentsInChildren<TMP_Text>();
            string bench  = p.isBenched          ? " [BENCHED]" : "";
            string ai     = p.isAI               ? " (AI)"      : "";
            string active = p == gm.CurrentPlayer ? "▶ "        : "   ";
            int    potMax = p.score + gm.RemainingBallValue;
            Color  col    = p.isBenched          ? ColBenched
                          : p == gm.CurrentPlayer ? ColGold : Color.white;

            if (txts.Length >= 3)
            {
                txts[0].text  = $"{active}{i + 1}. {p.playerName}{ai}{bench}";
                txts[1].text  = $"{p.score} pts";
                txts[2].text  = $"max {potMax}";
                txts[0].color = col;
            }
            else if (txts.Length >= 1)
            {
                txts[0].text  = $"{active}{i + 1}. {p.playerName}{ai}  {p.score}{bench}";
                txts[0].color = col;
            }
        }
    }

    GameObject MakeDefaultRow(Transform parent)
    {
        var go = new GameObject("LB_Row");
        go.transform.SetParent(parent, false);
        var t  = go.AddComponent<TMP_Text>();
        t.fontSize = 18;
        t.color    = Color.white;
        return go;
    }

    // =================================================================
    //  Notification banner
    // =================================================================
    void ShowNotif(string msg, Color col)
    {
        if (notifBanner == null) return;
        SetText(notifText, msg);
        if (notifBg) notifBg.color = col;
        if (notifCo != null) StopCoroutine(notifCo);
        notifCo = StartCoroutine(NotifRoutine());
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
        if (caromPopup == null) return;
        SetText(caromText, msg);
        if (caromText) caromText.color = ColCarom;
        if (caromCo != null) StopCoroutine(caromCo);
        caromCo = StartCoroutine(CaromRoutine());
    }

    IEnumerator CaromRoutine()
    {
        caromPopup.SetActive(true);
        Vector3 origin = caromPopup.transform.localPosition;
        float   t      = 0f;
        while (t < caromDuration)
        {
            t += Time.deltaTime;
            caromPopup.transform.localPosition = origin + Vector3.up * (t * 40f);
            float alpha = Mathf.Clamp01(1f - (t / caromDuration - 0.5f) * 3f);
            if (caromText) caromText.color = new Color(ColCarom.r, ColCarom.g, ColCarom.b, alpha);
            yield return null;
        }
        caromPopup.SetActive(false);
        caromPopup.transform.localPosition = origin;
    }

    // =================================================================
    //  Round-end buttons
    // =================================================================
    void OnContinueClicked()
    {
        if (roundEndPanel) roundEndPanel.SetActive(false);
        gm?.NewRound();
    }

    void OnQuitClicked() => gm?.QuitToLobby();

    // =================================================================
    //  Economy
    // =================================================================
    void RefreshPrizePool()
    {
        if (gm == null) return;
        string text = $"Prize Pool: {gm.PrizePool:N0} KSh";
        SetText(prizePoolLabel, text);
        SetText(prizePoolText,  text);   // scene-builder alias
    }

    // =================================================================
    //  Helpers
    // =================================================================
    void ShowBenchedOverlay(bool show)
    {
        if (benchedOverlay) benchedOverlay.SetActive(show);
        if (benchedLabel)   benchedLabel.gameObject.SetActive(show);
    }

    void HideAll()
    {
        if (notifBanner)   notifBanner.SetActive(false);
        if (caromPopup)    caromPopup.SetActive(false);
        if (roundEndPanel) roundEndPanel.SetActive(false);
        ShowBenchedOverlay(false);
    }

    static void SetText(TMP_Text t, string s) { if (t) t.text = s; }

    // =================================================================
    //  Public API
    // =================================================================
    public void RefreshAll()
    {
        if (gm == null) return;
        RefreshPrizePool();
        RefreshLeaderboard();
        if (gm.CurrentPlayer != null) OnTurnBegin(gm.CurrentPlayer);
    }
}