using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using TMPro;
using System.Collections;

/// <summary>
/// 30-second opponent search with "Play vs Computer" / "Keep Waiting" actions.
/// Mirrors the matchmaking flow from the HTML prototype.
/// </summary>
public class MatchmakingManager : MonoBehaviour
{
    [Header("Timing")]
    public float searchDuration = 30f;

    [Header("UI")]
    public TMP_Text timerText;
    public TMP_Text statusText;
    public Image timerRingFill;        // radial fill (Image with FilledType=Radial360)
    public Button playAIButton;
    public Button keepWaitingButton;

    [Header("Match Config")]
    public int numPlayers = 2;
    public int stakeAmount = 50;

    [Header("Scenes")]
    public string gameSceneName = "Game";
    public string lobbySceneName = "Lobby";

    float timeLeft;
    Coroutine searchRoutine;

    void OnEnable()
    {
        if (playAIButton)       playAIButton.onClick.AddListener(OnPlayAI);
        if (keepWaitingButton)  keepWaitingButton.onClick.AddListener(OnKeepWaiting);
        StartSearch();
    }

    void OnDisable()
    {
        if (playAIButton)       playAIButton.onClick.RemoveListener(OnPlayAI);
        if (keepWaitingButton)  keepWaitingButton.onClick.RemoveListener(OnKeepWaiting);
        if (searchRoutine != null) StopCoroutine(searchRoutine);
    }

    public void StartSearch()
    {
        if (searchRoutine != null) StopCoroutine(searchRoutine);
        timeLeft = searchDuration;
        if (statusText) statusText.text = "Searching for opponents";
        if (timerRingFill) {
            timerRingFill.color = UIColors.Gold;
            timerRingFill.fillAmount = 1f;
        }
        searchRoutine = StartCoroutine(SearchTick());
    }

    IEnumerator SearchTick()
    {
        while (timeLeft > 0)
        {
            timeLeft -= Time.deltaTime;
            if (timerText)     timerText.text = Mathf.CeilToInt(timeLeft).ToString();
            if (timerRingFill) timerRingFill.fillAmount = timeLeft / searchDuration;
            if (timerRingFill && timeLeft < 8f)
                timerRingFill.color = UIColors.Red;
            yield return null;
        }
        if (statusText) statusText.text = "No opponents found — play vs computer?";
    }

    public void OnPlayAI()
    {
        // Persist match config for the Game scene
        PlayerPrefs.SetInt("kp_numPlayers", numPlayers);
        PlayerPrefs.SetInt("kp_stake", stakeAmount);
        PlayerPrefs.SetInt("kp_vsAI", 1);
        SceneManager.LoadScene(gameSceneName);
    }

    public void OnKeepWaiting() => StartSearch();

    public void OnQuit() => SceneManager.LoadScene(lobbySceneName);
}
