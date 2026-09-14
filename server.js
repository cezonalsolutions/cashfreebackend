const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;


/* =====================================================
   CASHFREE ENVIRONMENT
===================================================== */

const CASHFREE_APP_ID =
  process.env.CASHFREE_APP_ID;

const CASHFREE_SECRET_KEY =
  process.env.CASHFREE_SECRET_KEY;

const CASHFREE_MODE =
  String(
    process.env.CASHFREE_MODE || "sandbox"
  ).toLowerCase();


const CASHFREE_BASE_URL =
  CASHFREE_MODE === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";


const CASHFREE_API_VERSION =
  "2025-01-01";


/* =====================================================
   HELPER - CLEAN MOBILE NUMBER
===================================================== */

function cleanMobile(value) {

  let mobile =
    String(value || "")
      .replace(/\D/g, "");


  // +91XXXXXXXXXX
  // 91XXXXXXXXXX
  if (
    mobile.length === 12 &&
    mobile.startsWith("91")
  ) {

    mobile =
      mobile.slice(2);

  }


  return mobile;
}


/* =====================================================
   HOME
===================================================== */

app.get("/", (req, res) => {

  return res.status(200).json({

    success: true,

    message:
      "Cashfree payment server is running",

    mode:
      CASHFREE_MODE

  });

});


/* =====================================================
   CREATE ORDER
===================================================== */

app.post(
  "/create-order",

  async (req, res) => {

    try {

      /*
        Accept:

        {
          mobile:"9876543210"
        }

        OR

        {
          customer_phone:"9876543210"
        }

        OR

        {
          phone:"9876543210"
        }
      */

      const mobile =
        cleanMobile(

          req.body?.mobile ||

          req.body?.customer_phone ||

          req.body?.phone ||

          ""

        );


      console.log(
        "Received mobile:",
        mobile
      );


      /* =========================
         VALIDATE MOBILE
      ========================= */

      if (
        !/^[6-9]\d{9}$/.test(mobile)
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Enter valid 10 digit mobile number"

          });

      }


      /* =========================
         CHECK KEYS
      ========================= */

      if (
        !CASHFREE_APP_ID ||
        !CASHFREE_SECRET_KEY
      ) {

        console.error(
          "Cashfree API keys missing"
        );


        return res
          .status(500)
          .json({

            success: false,

            message:
              "Cashfree API keys missing in server"

          });

      }


      /* =========================
         AMOUNT
      ========================= */

      const requestedAmount =
        Number(
          req.body?.amount || 1
        );


      if (
        !Number.isFinite(
          requestedAmount
        ) ||

        requestedAmount <= 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid payment amount"

          });

      }


      /*
        For testing we keep ₹1 maximum
        if frontend sends 1.

        Later CEZOO actual total
        can be passed here.
      */

      const amount =
        Number(
          requestedAmount.toFixed(2)
        );


      /* =========================
         CREATE ORDER ID
      ========================= */

      const orderId =
        "CEZOO_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();


      const customerId =
        "USER_" +
        mobile +
        "_" +
        Date.now();


      /* =========================
         CASHFREE REQUEST
      ========================= */

      const requestBody = {

        order_id:
          orderId,

        order_amount:
          amount,

        order_currency:
          "INR",

        customer_details: {

          customer_id:
            customerId,

          customer_phone:
            mobile

        },

        order_note:
          "CEZOO Cashfree payment"

      };


      console.log(
        "Creating Cashfree order:",
        {
          order_id: orderId,
          amount: amount,
          mobile: mobile,
          mode: CASHFREE_MODE
        }
      );


      const response =
        await axios.post(

          `${CASHFREE_BASE_URL}/orders`,

          requestBody,

          {

            headers: {

              "Content-Type":
                "application/json",

              "x-api-version":
                CASHFREE_API_VERSION,

              "x-client-id":
                CASHFREE_APP_ID,

              "x-client-secret":
                CASHFREE_SECRET_KEY

            },

            timeout:
              20000

          }

        );


      const cashfreeData =
        response.data;


      console.log(
        "Cashfree order created:",
        {
          order_id:
            cashfreeData.order_id,

          cf_order_id:
            cashfreeData.cf_order_id,

          order_status:
            cashfreeData.order_status
        }
      );


      /* =========================
         PAYMENT SESSION CHECK
      ========================= */

      if (
        !cashfreeData
          ?.payment_session_id
      ) {

        console.error(
          "payment_session_id missing:",
          cashfreeData
        );


        return res
          .status(502)
          .json({

            success: false,

            message:
              "Cashfree did not return payment_session_id",

            cashfree:
              cashfreeData

          });

      }


      /* =========================
         SUCCESS
      ========================= */

      return res
        .status(200)
        .json({

          success: true,

          order_id:
            cashfreeData.order_id,

          cf_order_id:
            cashfreeData.cf_order_id,

          payment_session_id:
            cashfreeData
              .payment_session_id,

          order_status:
            cashfreeData.order_status,

          amount:
            cashfreeData.order_amount,

          currency:
            cashfreeData.order_currency,

          mode:
            CASHFREE_MODE

        });


    } catch (error) {

      console.error(
        "CREATE ORDER ERROR:"
      );


      console.error(
        error.response?.data ||
        error.message ||
        error
      );


      const statusCode =
        error.response?.status ||
        500;


      return res
        .status(statusCode)
        .json({

          success: false,

          message:
            error.response
              ?.data
              ?.message ||

            error.message ||

            "Unable to create Cashfree order",

          cashfree_error:
            error.response?.data ||
            null

        });

    }

  }
);


/* =====================================================
   VERIFY PAYMENT
===================================================== */

app.get(
  "/verify-payment/:orderId",

  async (req, res) => {

    try {

      const orderId =
        String(
          req.params.orderId || ""
        ).trim();


      if (!orderId) {

        return res
          .status(400)
          .json({

            success: false,

            paid: false,

            message:
              "Order ID required"

          });

      }


      if (
        !CASHFREE_APP_ID ||
        !CASHFREE_SECRET_KEY
      ) {

        return res
          .status(500)
          .json({

            success: false,

            paid: false,

            message:
              "Cashfree API keys missing in server"

          });

      }


      const response =
        await axios.get(

          `${CASHFREE_BASE_URL}/orders/${encodeURIComponent(
            orderId
          )}`,

          {

            headers: {

              "x-api-version":
                CASHFREE_API_VERSION,

              "x-client-id":
                CASHFREE_APP_ID,

              "x-client-secret":
                CASHFREE_SECRET_KEY

            },

            timeout:
              20000

          }

        );


      const data =
        response.data;


      const orderStatus =
        String(
          data?.order_status || ""
        ).toUpperCase();


      console.log(
        "Verify order:",
        orderId,
        orderStatus
      );


      /* =========================
         PAID
      ========================= */

      if (
        orderStatus === "PAID"
      ) {

        return res
          .status(200)
          .json({

            success: true,

            verified: true,

            paid: true,

            processing: false,

            order_id:
              data.order_id,

            cf_order_id:
              data.cf_order_id,

            order_status:
              orderStatus,

            order_amount:
              data.order_amount,

            order_currency:
              data.order_currency,

            mode:
              CASHFREE_MODE

          });

      }


      /* =========================
         ACTIVE / PENDING
      ========================= */

      if (
        orderStatus === "ACTIVE"
      ) {

        return res
          .status(200)
          .json({

            success: true,

            verified: true,

            paid: false,

            processing: true,

            order_id:
              data.order_id,

            order_status:
              orderStatus,

            order_amount:
              data.order_amount,

            message:
              "Payment is still pending"

          });

      }


      /* =========================
         OTHER STATUS
      ========================= */

      return res
        .status(200)
        .json({

          success: true,

          verified: true,

          paid: false,

          processing: false,

          order_id:
            data.order_id,

          order_status:
            orderStatus,

          order_amount:
            data.order_amount,

          message:
            "Payment not completed"

        });


    } catch (error) {

      console.error(
        "VERIFY PAYMENT ERROR:"
      );


      console.error(
        error.response?.data ||
        error.message ||
        error
      );


      return res
        .status(
          error.response?.status ||
          500
        )
        .json({

          success: false,

          verified: false,

          paid: false,

          message:
            error.response
              ?.data
              ?.message ||

            error.message ||

            "Unable to verify payment",

          cashfree_error:
            error.response?.data ||
            null

        });

    }

  }
);


/* =====================================================
   404
===================================================== */

app.use(
  (req, res) => {

    return res
      .status(404)
      .json({

        success: false,

        message:
          "Route not found"

      });

  }
);


/* =====================================================
   START SERVER
===================================================== */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Cashfree server running on port ${PORT}`
    );

    console.log(
      `Cashfree mode: ${CASHFREE_MODE}`
    );

  }
);
