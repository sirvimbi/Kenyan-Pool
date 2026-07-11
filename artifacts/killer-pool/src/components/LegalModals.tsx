import { X } from "lucide-react";

interface LegalModalProps {
  type: "terms" | "privacy";
  onClose: () => void;
}

export function LegalModal({ type, onClose }: LegalModalProps) {
  return (
    <div className="quit-overlay" style={{ zIndex: 2000 }}>
      <div className="quit-box" style={{ maxWidth: "600px", textAlign: "left", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="chat-hdr" style={{ borderTopLeftRadius: "12px", borderTopRightRadius: "12px" }}>
          <span>{type === "terms" ? "Terms & Conditions" : "Privacy Policy"}</span>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", fontSize: "13px", lineHeight: "1.6", color: "rgba(255,255,255,0.8)" }}>
          {type === "terms" ? (
            <>
              <h2 style={{ color: "var(--gold)", fontSize: "18px", marginBottom: "10px" }}>KILLER POOL – NAIROBI NIGHTS</h2>
              <h3 style={{ fontSize: "16px", marginBottom: "15px" }}>Terms and Conditions of Use</h3>
              <p>Effective Date: 30 June 2026</p>
              <p style={{ background: "rgba(212,160,18,0.1)", padding: "10px", borderRadius: "8px", border: "1px solid var(--gold)", color: "var(--gold)", fontWeight: "bold", margin: "15px 0" }}>
                NON-GAMBLING DISCLAIMER: This is a recreational, skill-based game. Virtual currency has NO cash value.
              </p>
              <p>Operated by: Sir Vimbi Enterprise<br />Email: kilu@kenyanpool.com | Tel: +254 717 866 266</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>1. Acceptance of Terms</h4>
              <p>By downloading, installing, accessing, or using Killer Pool – Nairobi Nights (the "App"), you confirm that you have read, understood, and agree to be bound by these Terms and Conditions ("Terms"). If you do not agree, you must not use the App. These Terms form a legally binding agreement between you and Sir Vimbi Enterprise ("we", "us", or "our").</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>2. Nature of the App – Not a Gambling Product</h4>
              <p>Killer Pool – Nairobi Nights is a skill-based recreational billiards game and is NOT a gambling application. Specifically:</p>
              <ul>
                <li>All in-app currency ("Nairobi Shillings" or similar play-money) has no real-world monetary value, cannot be exchanged for cash, and cannot be transferred to another user or third-party service.</li>
                <li>No wager of real money is required to play the game.</li>
                <li>Winning or losing within the App does not result in any financial gain or loss.</li>
                <li>The App is operated purely for entertainment and social enjoyment.</li>
              </ul>
              <p>We reserve the right to amend the App's features to ensure continued compliance with applicable Kenyan law and international app-store policies.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>3. Eligibility</h4>
              <ul>
                <li>You must be at least 13 years of age to create an account and use the App.</li>
                <li>Users aged 13–17 must have parental or guardian consent.</li>
                <li>You must not be prohibited from using the App under the laws of Kenya or any other jurisdiction applicable to you.</li>
                <li>By registering, you confirm that the information you provide – including your age – is accurate and truthful.</li>
              </ul>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>4. Account Registration & Security</h4>
              <p>To access certain features you must create an account. You agree to:</p>
              <ul>
                <li>Provide accurate, current, and complete information including your name, email address, phone number, and date of birth.</li>
                <li>Keep your login credentials confidential.</li>
                <li>Notify us immediately at kilu@kenyanpool.com if you suspect any unauthorised use of your account.</li>
              </ul>
              <p>We reserve the right to suspend or terminate accounts that we reasonably believe contain false information.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>5. In-App Purchases</h4>
              <p>5.1 What You Can Purchase<br />The App offers optional in-app purchases ("IAP") such as virtual currency packs, cosmetic items (cue skins, table themes), and booster packs. All purchases are made in real currency through the applicable app-store platform (Google Play Store or Apple App Store).</p>
              <p>5.2 Payment & Billing</p>
              <ul>
                <li>All purchases are processed and billed by the relevant app-store operator (Google / Apple) under their payment terms.</li>
                <li>Prices are displayed in Kenyan Shillings (KES) or your local currency as determined by your app store.</li>
                <li>Purchases are final and non-refundable except where required by applicable law or the app-store operator's refund policy.</li>
              </ul>
              <p>5.3 No Real-World Value<br />Virtual items and play-money obtained through IAP or gameplay carry no real-world monetary value and are not redeemable for cash, prizes, or any other goods and services outside the App.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>6. Communications and Marketing Consent</h4>
              <p>By creating an account, you expressly consent to receive promotional emails, SMS messages, and push notifications. You may opt out at any time.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>7. Acceptable Use</h4>
              <p>You agree not to cheat, harass other players, transmit unlawful content, or reverse-engineer the App.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>8. Intellectual Property</h4>
              <p>All content within the App is owned by or licensed to Sir Vimbi Enterprise.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>9. Disclaimers and Limitation of Liability</h4>
              <p>The App is provided "as is". Our total aggregate liability to you is limited.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>10. Termination</h4>
              <p>We may suspend or terminate your account at any time for breach of these Terms.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>11. Governing Law</h4>
              <p>These Terms are governed by the laws of the Republic of Kenya.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>12. Changes to These Terms</h4>
              <p>We may update these Terms from time to time with at least 14 days' notice.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>13. Contact Us</h4>
              <p>Sir Vimbi Enterprise<br />Email: kilu@kenyanpool.com<br />Tel: +254 717 866 266<br />Nairobi, Kenya</p>
            </>
          ) : (
            <>
              <h2 style={{ color: "var(--gold)", fontSize: "18px", marginBottom: "10px" }}>KILLER POOL – NAIROBI NIGHTS</h2>
              <h3 style={{ fontSize: "16px", marginBottom: "15px" }}>Privacy Policy</h3>
              <p>Effective Date: 30 June 2026</p>
              <p style={{ background: "rgba(212,160,18,0.1)", padding: "10px", borderRadius: "8px", border: "1px solid var(--gold)", color: "var(--gold)", fontWeight: "bold", margin: "15px 0" }}>
                NON-GAMBLING DISCLAIMER: This app is NOT a gambling platform. All data is processed for recreational gameplay only.
              </p>
              <p>Data Controller: Sir Vimbi Enterprise<br />Email: kilu@kenyanpool.com | Tel: +254 717 866 266</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>1. Introduction</h4>
              <p>Sir Vimbi Enterprise respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use Killer Pool – Nairobi Nights (the "App").</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>2. Information We Collect</h4>
              <p>2.1 Information You Provide to Us: name, email, phone number, date of birth.</p>
              <p>2.2 Information Collected Automatically: device identifiers, IP address, gameplay statistics, transaction records.</p>
              <p>2.3 Information from Third Parties: authentication data from Google or Apple, Firebase Analytics.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>3. How We Use Your Information</h4>
              <p>We use your data to provide the App, communicate with you, improve our services, and comply with legal obligations.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>4. Legal Basis for Processing</h4>
              <p>Processing is based on contract, legitimate interests, consent, or legal obligation.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>5. Sharing Your Information</h4>
              <p>We do not sell your personal data. We share with essential service providers like Google (Firebase) and Apple.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>6. Data Retention</h4>
              <p>We retain data as long as your account is active or as needed for legal compliance.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>7. Data Security</h4>
              <p>We implement industry-standard technical measures to protect your data.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>8. International Data Transfers</h4>
              <p>Data may be processed on servers located outside Kenya (e.g., US).</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>9. Children's Privacy</h4>
              <p>The App is not directed to children under 13.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>10. Your Rights</h4>
              <p>You have rights of access, rectification, erasure, and more. Contact us to exercise these.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>11. Marketing Opt-Out</h4>
              <p>You may opt out of marketing communications at any time.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>12. Cookies and Tracking</h4>
              <p>We use Firebase SDK tracking and analytics.</p>

              <h4 style={{ color: "var(--gold)", marginTop: "15px" }}>13. Contact Us</h4>
              <p>Sir Vimbi Enterprise<br />Email: kilu@kenyanpool.com<br />Tel: +254 717 866 266<br />Nairobi, Kenya</p>
            </>
          )}
        </div>
        <div style={{ padding: "16px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <button className="signin-submit" onClick={onClose} style={{ width: "auto", padding: "10px 40px" }}>
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
}
