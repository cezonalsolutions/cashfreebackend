const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

// TEST first.
// Later Render env lo CASHFREE_MODE=production pettachu.
const CASHFREE_MODE =
  process.env.CASHFREE_MODE || "sandbox";

const CASHFREE_BASE_URL =
  CASHFREE_MODE === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

const CASHFREE_API_VERSION = "2025-01-01";


/* =====================================================
   HOME
===================================================== */

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "Cashfree payment server is running",
    mode: CASHFREE_MODE
  });

});


/* =====================================================
   CREATE ₹1 ORDER
===================================================== */

app.post("/create-order", async (req, res) => {

  try {

    const mobile = String(
      req.body.mobile || ""
    ).replace(/\D/g, "");

    if (!/^[6-9]\d{9}$/.test(mobile)) {

      return res.status(400).json({
        success: false,
        message: "Enter valid 10 digit mobile number"
      });

    }

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {

      return res.status(500).json({
        success: false,
        message: "Cashfree API keys missing in server"
      });

    }


    const orderId =
      "ORDER_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();


    const customerId =
      "USER_" + mobile + "_" + Date.now();


    const requestBody = {

      order_id: orderId,

      order_amount: 1,

      order_currency: "INR",

      customer_details: {

        customer_id: customerId,

        customer_phone: mobile

      },

      order_note: "₹1 PhonePe test payment"

    };


    const response = await axios.post(

      `${CASHFREE_BASE_URL}/orders`,

      requestBody,

      {

        headers: {

          "Content-Type": "application/json",

          "x-api-version":
            CASHFREE_API_VERSION,

          "x-client-id":
            CASHFREE_APP_ID,

          "x-client-secret":
            CASHFREE_SECRET_KEY

        }

      }

    );


    return res.json({

      success: true,

      order_id:
        response.data.order_id,

      cf_order_id:
        response.data.cf_order_id,

      payment_session_id:
        response.data.payment_session_id,

      amount: 1,

      mode: CASHFREE_MODE

    });


  } catch (error) {

    console.error(
      "Create Order Error:",
      error.response?.data || error.message
    );


    return res
      .status(error.response?.status || 500)
      .json({

        success: false,

        message:
          error.response?.data?.message ||
          "Unable to create Cashfree order",

        cashfree_error:
          error.response?.data || null

      });

  }

});


/* =====================================================
   VERIFY PAYMENT
===================================================== */

app.get("/verify-payment/:orderId", async (req, res) => {

  try {

    const orderId =
      req.params.orderId;

    if (!orderId) {

      return res.status(400).json({
        success: false,
        message: "Order ID required"
      });

    }


    const response = await axios.get(

      `${CASHFREE_BASE_URL}/orders/${encodeURIComponent(orderId)}`,

      {

        headers: {

          "x-api-version":
            CASHFREE_API_VERSION,

          "x-client-id":
            CASHFREE_APP_ID,

          "x-client-secret":
            CASHFREE_SECRET_KEY

        }

      }

    );


    const orderStatus =
      response.data.order_status;


    return res.json({

      success:
        orderStatus === "PAID",

      paid:
        orderStatus === "PAID",

      order_id:
        response.data.order_id,

      order_status:
        orderStatus,

      order_amount:
        response.data.order_amount,

      data:
        response.data

    });


  } catch (error) {

    console.error(
      "Verify Payment Error:",
      error.response?.data || error.message
    );


    return res
      .status(error.response?.status || 500)
      .json({

        success: false,

        message:
          error.response?.data?.message ||
          "Unable to verify payment",

        cashfree_error:
          error.response?.data || null

      });

  }

});


/* =====================================================
   START SERVER
===================================================== */

app.listen(PORT, () => {

  console.log(
    `Cashfree server running on port ${PORT}`
  );

});
