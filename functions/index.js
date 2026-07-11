const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const cors = require("cors")({origin: true});

admin.initializeApp();

// WebHook URL: https://us-central1-kenyan-pool.cloudfunctions.net/paystackWebhook
exports.paystackWebhook = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const secret = "sk_test_a9d425dc4e8fbdda29f2a2b74a8f83d87a5f43ae";
      const signature = req.headers["x-paystack-signature"];

      // Verify signature
      const bodyStr = JSON.stringify(req.body);
      const hash = crypto.createHmac("sha512", secret)
          .update(bodyStr)
          .digest("hex");

      if (hash !== signature) {
        console.error("Invalid Paystack signature");
        return res.status(401).send("Unauthorized");
      }

      const event = req.body;
      console.log("Webhook received:", event.event);

      // Handle charge.success event
      if (event.event === "charge.success") {
        const data = event.data;
        const metadata = data.metadata || {};
        const customFields = metadata.custom_fields || [];

        const userIdField = customFields.find(
            (f) => f.variable_name === "user_id",
        );
        const creditsField = customFields.find(
            (f) => f.variable_name === "credits",
        );

        const userId = userIdField ? userIdField.value : null;
        const creditsStr = creditsField ? creditsField.value : null;

        if (userId && creditsStr) {
          const credits = parseInt(creditsStr, 10);

          await admin.firestore()
              .collection("profiles")
              .doc(userId)
              .update({
                "wallet.play": admin.firestore.FieldValue.increment(credits),
                "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
              });

          console.log(`Added ${credits} credits to user ${userId}`);
        }
      }

      res.status(200).send("Webhook received");
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).send("Internal Server Error");
    }
  });
});

// Callback URL: https://us-central1-kenyan-pool.cloudfunctions.net/paystackCallback
exports.paystackCallback = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const {reference, trxref} = req.query;

      console.log("Payment callback:", {reference, trxref});

      // Redirect back to your app
      const baseUrl = "https://kenyan-pool.web.app/dashboard";
      res.redirect(`${baseUrl}?payment=success&ref=${reference}`);
    } catch (error) {
      console.error("Callback error:", error);
      res.redirect("https://kenyan-pool.web.app/dashboard?payment=failed");
    }
  });
});
