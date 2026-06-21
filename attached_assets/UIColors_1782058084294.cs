using UnityEngine;

/// <summary>
/// Killer Pool brand color tokens, mirroring colors_and_type.css from the design system.
/// Use these instead of hardcoding hex values in scripts or materials.
/// </summary>
public static class UIColors
{
    // Surface
    public static readonly Color BgDark        = Hex("0d0a07");
    public static readonly Color BgRaised      = Hex("1a1208");
    public static readonly Color BgPanel       = Hex("241808");

    // Foreground / type
    public static readonly Color FgPrimary     = Hex("f5e9c8");
    public static readonly Color FgSecondary   = Hex("a89060");
    public static readonly Color FgMuted       = Hex("5c4a2a");

    // Brand
    public static readonly Color Gold          = Hex("d4a012");
    public static readonly Color GoldLight     = Hex("f0c040");
    public static readonly Color GoldDark      = Hex("8a6a08");

    // Felt + wood
    public static readonly Color FeltGreen     = Hex("3bb041");
    public static readonly Color FeltDark      = Hex("1e5e23");
    public static readonly Color WoodWalnut    = Hex("3d2408");
    public static readonly Color WoodLight     = Hex("5a3510");
    public static readonly Color WoodDark      = Hex("1a0e04");

    // Semantic
    public static readonly Color Red           = Hex("e82c1a");
    public static readonly Color GreenOk       = Hex("3bb041");
    public static readonly Color Warning       = Hex("f0c040");
    public static readonly Color LedBlue       = Hex("0044ff");
    public static readonly Color NeonGreen     = Hex("00ff88");
    public static readonly Color NeonRed       = Hex("ff4422");

    static Color Hex(string h)
    {
        ColorUtility.TryParseHtmlString("#" + h, out Color c);
        return c;
    }
}
