const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;


/* =====================================================
   CASHFREE CONFIG
===================================================== */

const CASHFREE_APP_ID =
  process.env.CASHFREE_APP_ID;

const CASHFREE_SECRET_KEY =
  process.env.CASHFREE_SECRET_KEY;


/*
  IMPORTANT:

  Sandbox testing:
  CASHFREE_MODE=sandbox

  Live:
  CASHFREE_MODE=production
*/

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
   CLEAN MOBILE
===================================================== */

function cleanMobile(value) {

  let mobile =
    String(value || "")
      .replace(/\D/g, "");


  /*
    +91 9876543210
    becomes
    9876543210
  */

  if (
    mobile.length === 12 &&
    mobile.startsWith("91")
  ) {

    mobile =
      mobile.substring(2);

  }


  return mobile;
}


/* =====================================================
   HOME / HEALTH CHECK
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
   CREATE CASHFREE ORDER
===================================================== */

app.post(
  "/create-order",

  async (req, res) => {

    try {


      /* =========================================
         GET MOBILE
      ========================================= */

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


      /* =========================================
         VALIDATE MOBILE
      ========================================= */

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


      /* =========================================
         CHECK CASHFREE KEYS
      ========================================= */

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


      /* =========================================
         PAYMENT AMOUNT
      ========================================= */

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


      const amount =
        Number(
          requestedAmount.toFixed(2)
        );


      /* =========================================
         GENERATE ORDER ID
      ========================================= */

      const orderId =
        "CEZOO_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();


      /* =========================================
         GENERATE CUSTOMER ID
      ========================================= */

      const customerId =
        "USER_" +
        mobile +
        "_" +
        Date.now();


      /* =========================================
         REQUEST BODY
      ========================================= */

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
          "CEZOO Cashfree Payment"

      };


      console.log(
        "Creating Cashfree Order:",
        {
          order_id:
            orderId,

          amount:
            amount,

          mobile:
            mobile,

          mode:
            CASHFREE_MODE,

          url:
            CASHFREE_BASE_URL
        }
      );


      /* =========================================
         CALL CASHFREE
      ========================================= */

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


      const data =
        response.data;


      console.log(
        "Cashfree Order Response:",
        data
      );


      /* =========================================
         CHECK SESSION
      ========================================= */

      if (
        !data?.payment_session_id
      ) {

        return res
          .status(502)
          .json({

            success: false,

            message:
              "payment_session_id not received from Cashfree",

            cashfree:
              data

          });

      }


      /* =========================================
         SUCCESS
      ========================================= */

      return res
        .status(200)
        .json({

          success: true,

          order_id:
            data.order_id,

          cf_order_id:
            data.cf_order_id,

          payment_session_id:
            data.payment_session_id,

          order_status:
            data.order_status,

          amount:
            data.order_amount,

          currency:
            data.order_currency,

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


      return res
        .status(
          error.response?.status ||
          500
        )
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


      /* =========================================
         CHECK KEYS
      ========================================= */

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


      /* =========================================
         FETCH ORDER FROM CASHFREE
      ========================================= */

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
        "Payment Status:",
        orderId,
        orderStatus
      );


      /* =========================================
         PAID
      ========================================= */

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


      /* =========================================
         ACTIVE / PENDING
      ========================================= */

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


      /* =========================================
         EXPIRED
      ========================================= */

      if (
        orderStatus === "EXPIRED"
      ) {

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

            message:
              "Payment order expired"

          });

      }


      /* =========================================
         OTHER STATUS
      ========================================= */

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
   ERROR HANDLER
===================================================== */

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(error);

    }


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Internal server error"

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

    console.log(
      `Cashfree API URL: ${CASHFREE_BASE_URL}`
    );

  }
);
