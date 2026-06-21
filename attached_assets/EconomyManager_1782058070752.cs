// ============= EconomyManager.cs - KILLER POOL VIRTUAL ECONOMY =============
// Implements: KSh virtual currency, payout system, tie splitting (§4)
using UnityEngine;
using System.Collections.Generic;
using System.Linq;

public class EconomyManager : MonoBehaviour
{
    // ─────────────────────────────────────────────
    // SINGLETON
    // ─────────────────────────────────────────────
    private static EconomyManager _instance;
    public static EconomyManager Instance
    {
        get
        {
            if (_instance == null) _instance = FindFirstObjectByType<EconomyManager>();
            return _instance;
        }
    }

    // ─────────────────────────────────────────────
    // CONSTANTS (per design spec §4)
    // ─────────────────────────────────────────────
    public const float SERVICE_FEE_RATE  = 0.10f;   // 10% platform fee
    public const float STARTING_BALANCE  = 100000f;  // 100,000 KSh
    public const float DEFAULT_STAKE     = 5000f;    // 5,000 KSh per game

    // ─────────────────────────────────────────────
    // INSPECTOR SETTINGS
    // ─────────────────────────────────────────────
    [Header("Economy Settings")]
    public float serviceFeeRate = SERVICE_FEE_RATE;

    [Header("Transaction Log")]
    public bool logTransactions = true;

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────
    public System.Action<Player, float> OnBalanceChanged;
    public System.Action<PayoutResult>  OnPayoutProcessed;

    // ─────────────────────────────────────────────
    // DATA STRUCTURES
    // ─────────────────────────────────────────────
    [System.Serializable]
    public class PayoutResult
    {
        public float totalPool;
        public float serviceFee;
        public float netPool;
        public List<Player> winners;
        public float payoutPerWinner;
        public bool isTie => winners != null && winners.Count > 1;
    }

    [System.Serializable]
    public class TransactionRecord
    {
        public string playerId;
        public string playerName;
        public float amount;
        public string reason;
        public float newBalance;
        public System.DateTime timestamp;
    }

    public List<TransactionRecord> transactionHistory = new List<TransactionRecord>();

    // ─────────────────────────────────────────────
    // UNITY LIFECYCLE
    // ─────────────────────────────────────────────
    void Awake()
    {
        if (_instance != null && _instance != this) { Destroy(gameObject); return; }
        _instance = this;
    }

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────

    /// <summary>Deducts the stake from every player's balance before the game starts.</summary>
    public void DeductStakes(List<Player> players, float stakeAmount)
    {
        foreach (Player p in players)
        {
            if (p.balance >= stakeAmount)
            {
                ApplyTransaction(p, -stakeAmount, "Game stake");
            }
            else
            {
                // Insufficient funds — deduct what they have
                ApplyTransaction(p, -p.balance, "Game stake (partial)");
                Debug.LogWarning($"[Economy] {p.playerName} had insufficient funds!");
            }
        }
    }

    /// <summary>
    /// Processes the full payout at round end.
    /// Single winner → 100% of net pool.
    /// Tie → net pool split equally.
    /// </summary>
    public PayoutResult ProcessPayout(List<Player> winners, float totalPool)
    {
        float serviceFee      = totalPool * serviceFeeRate;
        float netPool         = totalPool - serviceFee;
        float payoutPerWinner = winners.Count > 0 ? netPool / winners.Count : 0f;

        PayoutResult result = new PayoutResult
        {
            totalPool      = totalPool,
            serviceFee     = serviceFee,
            netPool        = netPool,
            winners        = winners,
            payoutPerWinner = payoutPerWinner
        };

        foreach (Player winner in winners)
        {
            ApplyTransaction(winner, payoutPerWinner,
                winners.Count > 1 ? $"Tie payout (1/{winners.Count} of net pool)" : "Winner payout");
        }

        LogPayoutSummary(result);
        OnPayoutProcessed?.Invoke(result);
        return result;
    }

    /// <summary>Top-up a player to starting balance (e.g. new account).</summary>
    public void GrantStartingBalance(Player player)
    {
        float needed = STARTING_BALANCE - player.balance;
        if (needed > 0)
            ApplyTransaction(player, needed, "Starting balance grant");
    }

    /// <summary>Check if a player can afford a stake.</summary>
    public bool CanAffordStake(Player player, float stake)
    {
        return player.balance >= stake;
    }

    /// <summary>Format a KSh amount as a display string.</summary>
    public static string FormatKSh(float amount)
    {
        return $"KSh {amount:N0}";
    }

    // ─────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────
    void ApplyTransaction(Player player, float amount, string reason)
    {
        player.balance += amount;
        if (player.balance < 0) player.balance = 0;

        TransactionRecord record = new TransactionRecord
        {
            playerId    = player.playerId,
            playerName  = player.playerName,
            amount      = amount,
            reason      = reason,
            newBalance  = player.balance,
            timestamp   = System.DateTime.Now
        };

        transactionHistory.Add(record);

        if (logTransactions)
            Debug.Log($"[Economy] {player.playerName}: {(amount >= 0 ? "+" : "")}{amount:N0} KSh ({reason}) → Balance: {player.balance:N0} KSh");

        OnBalanceChanged?.Invoke(player, player.balance);
    }

    void LogPayoutSummary(PayoutResult result)
    {
        string winnerNames = string.Join(", ", result.winners.Select(w => w.playerName));
        Debug.Log($"[Economy] ─── PAYOUT SUMMARY ───");
        Debug.Log($"[Economy] Total Pool  : {FormatKSh(result.totalPool)}");
        Debug.Log($"[Economy] Service Fee : {FormatKSh(result.serviceFee)} ({serviceFeeRate * 100:F0}%)");
        Debug.Log($"[Economy] Net Pool    : {FormatKSh(result.netPool)}");
        Debug.Log($"[Economy] Winners     : {winnerNames} ({result.winners.Count})");
        Debug.Log($"[Economy] Per Winner  : {FormatKSh(result.payoutPerWinner)}");
        if (result.isTie) Debug.Log($"[Economy] TIE GAME – pot split {result.winners.Count} ways");
    }
}