const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 5000;


/* =====================================================
   CASHFREE PRODUCTION CONFIG
===================================================== */

const CASHFREE_APP_ID =
  process.env.CASHFREE_APP_ID;

const CASHFREE_SECRET_KEY =
  process.env.CASHFREE_SECRET_KEY;

const CASHFREE_MODE =
  "production";

const CASHFREE_BASE_URL =
  "https://api.cashfree.com/pg";

const CASHFREE_API_VERSION =
  "2025-01-01";


/* =====================================================
   CORS
===================================================== */

app.use(cors());


/* =====================================================
   CASHFREE WEBHOOK
   IMPORTANT:
   MUST BE BEFORE express.json()
===================================================== */

app.post(
  "/cashfree-webhook",

  express.raw({
    type: "application/json"
  }),

  (req, res) => {

    try {

      console.log(
        "=================================="
      );

      console.log(
        "CASHFREE WEBHOOK RECEIVED"
      );


      /* =========================================
         GET WEBHOOK HEADERS
      ========================================= */

      const timestamp =
        req.headers[
          "x-webhook-timestamp"
        ];

      const receivedSignature =
        req.headers[
          "x-webhook-signature"
        ];


      if (
        !timestamp ||
        !receivedSignature
      ) {

        console.log(
          "Webhook headers missing"
        );

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Missing Cashfree webhook headers"

          });

      }


      /* =========================================
         RAW BODY
      ========================================= */

      const rawBody =
        req.body.toString(
          "utf8"
        );


      console.log(
        "Webhook Timestamp:",
        timestamp
      );


      /* =========================================
         VERIFY SECRET EXISTS
      ========================================= */

      if (
        !CASHFREE_SECRET_KEY
      ) {

        console.error(
          "Cashfree secret key missing"
        );

        return res
          .status(500)
          .json({

            success: false,

            message:
              "Cashfree secret key missing"

          });

      }


      /* =========================================
         CASHFREE SIGNATURE VERIFICATION

         signature =
         BASE64(
           HMAC_SHA256(
             timestamp + rawBody,
             secretKey
           )
         )
      ========================================= */

      const signedPayload =
        timestamp +
        rawBody;


      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            CASHFREE_SECRET_KEY
          )
          .update(
            signedPayload
          )
          .digest(
            "base64"
          );


      /* =========================================
         SAFE SIGNATURE COMPARISON
      ========================================= */

      const expectedBuffer =
        Buffer.from(
          expectedSignature
        );

      const receivedBuffer =
        Buffer.from(
          receivedSignature
        );


      let signatureValid =
        false;


      if (
        expectedBuffer.length ===
        receivedBuffer.length
      ) {

        signatureValid =
          crypto.timingSafeEqual(
            expectedBuffer,
            receivedBuffer
          );

      }


      if (
        !signatureValid
      ) {

        console.error(
          "INVALID CASHFREE WEBHOOK SIGNATURE"
        );

        return res
          .status(401)
          .json({

            success: false,

            message:
              "Invalid webhook signature"

          });

      }


      console.log(
        "Webhook signature verified ✅"
      );


      /* =========================================
         PARSE WEBHOOK BODY
      ========================================= */

      let payload;


      try {

        payload =
          JSON.parse(
            rawBody
          );

      }
      catch (parseError) {

        console.error(
          "Invalid webhook JSON"
        );

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Invalid webhook body"

          });

      }


      /* =========================================
         READ CASHFREE DATA
      ========================================= */

      const eventType =
        payload?.type ||
        "UNKNOWN";


      const orderId =
        payload
          ?.data
          ?.order
          ?.order_id ||
        null;


      const cfPaymentId =
        payload
          ?.data
          ?.payment
          ?.cf_payment_id ||
        null;


      const paymentStatus =
        String(
          payload
            ?.data
            ?.payment
            ?.payment_status ||
          ""
        ).toUpperCase();


      const paymentAmount =
        payload
          ?.data
          ?.payment
          ?.payment_amount ||
        null;


      const paymentMethod =
        payload
          ?.data
          ?.payment
          ?.payment_group ||
        null;


      console.log(
        "Webhook Event:",
        eventType
      );

      console.log(
        "Order ID:",
        orderId
      );

      console.log(
        "CF Payment ID:",
        cfPaymentId
      );

      console.log(
        "Payment Status:",
        paymentStatus
      );

      console.log(
        "Payment Amount:",
        paymentAmount
      );

      console.log(
        "Payment Method:",
        paymentMethod
      );


      /* =========================================
         PAYMENT SUCCESS
      ========================================= */

      if (
        paymentStatus ===
        "SUCCESS"
      ) {

        console.log(
          "PAYMENT SUCCESS ✅"
        );

        /*
          IMPORTANT:

          Here later you can update
          Supabase order as PAID.

          Example:

          await supabase
            .from("orders")
            .update({
              payment_status: "paid",
              cf_payment_id: cfPaymentId
            })
            .eq("order_id", orderId);
        */

      }


      /* =========================================
         PAYMENT FAILED
      ========================================= */

      else if (
        paymentStatus ===
        "FAILED"
      ) {

        console.log(
          "PAYMENT FAILED ❌"
        );

      }


      /* =========================================
         PAYMENT PENDING
      ========================================= */

      else if (
        paymentStatus ===
        "PENDING"
      ) {

        console.log(
          "PAYMENT PENDING ⏳"
        );

      }


      /* =========================================
         USER DROPPED
      ========================================= */

      else if (
        paymentStatus ===
        "USER_DROPPED"
      ) {

        console.log(
          "PAYMENT USER DROPPED"
        );

      }


      /* =========================================
         RESPOND 200 TO CASHFREE
      ========================================= */

      return res
        .status(200)
        .json({

          success: true,

          message:
            "Webhook received"

        });


    }
    catch (error) {

      console.error(
        "CASHFREE WEBHOOK ERROR:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Webhook processing failed"

        });

    }

  }
);


/* =====================================================
   NORMAL JSON BODY PARSER
   MUST BE AFTER WEBHOOK
===================================================== */

app.use(
  express.json()
);


/* =====================================================
   CLEAN MOBILE
===================================================== */

function cleanMobile(
  value
) {

  let mobile =
    String(
      value || ""
    )
      .replace(
        /\D/g,
        ""
      );


  if (
    mobile.length === 12 &&
    mobile.startsWith("91")
  ) {

    mobile =
      mobile.substring(
        2
      );

  }


  return mobile;

}


/* =====================================================
   HOME / HEALTH CHECK
===================================================== */

app.get(
  "/",

  (req, res) => {

    return res
      .status(200)
      .json({

        success:
          true,

        message:
          "Cashfree payment server is running",

        mode:
          CASHFREE_MODE,

        api:
          CASHFREE_BASE_URL,

        webhook:
          "/cashfree-webhook"

      });

  }
);


/* =====================================================
   CREATE CASHFREE ORDER
===================================================== */

app.post(
  "/create-order",

  async (
    req,
    res
  ) => {

    try {


      /* =========================================
         GET MOBILE
      ========================================= */

      const mobile =
        cleanMobile(

          req.body
            ?.mobile ||

          req.body
            ?.customer_phone ||

          req.body
            ?.phone ||

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
        !/^[6-9]\d{9}$/
          .test(
            mobile
          )
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

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
          "Cashfree production API keys missing"
        );


        return res
          .status(500)
          .json({

            success:
              false,

            message:
              "Cashfree production API keys missing in server"

          });

      }


      /* =========================================
         PAYMENT AMOUNT
      ========================================= */

      const requestedAmount =
        Number(
          req.body
            ?.amount ||
          1
        );


      if (
        !Number
          .isFinite(
            requestedAmount
          ) ||

        requestedAmount <=
        0
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Invalid payment amount"

          });

      }


      const amount =
        Number(
          requestedAmount
            .toFixed(2)
        );


      /* =========================================
         ORDER ID
      ========================================= */

      const orderId =
        "CEZOO_" +

        Date.now() +

        "_" +

        Math
          .random()
          .toString(36)
          .substring(
            2,
            8
          )
          .toUpperCase();


      /* =========================================
         CUSTOMER ID
      ========================================= */

      const customerId =
        "USER_" +

        mobile +

        "_" +

        Date.now();


      /* =========================================
         ORDER REQUEST
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
          "CEZOO Payment",

        order_meta: {

          notify_url:
            "https://cashfreebackend-l9r0.onrender.com/cashfree-webhook"

        }

      };


      console.log(
        "Creating Cashfree Production Order:",
        {

          order_id:
            orderId,

          amount:
            amount,

          mobile:
            mobile

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

              "Accept":
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
        "Cashfree Order Created:",
        {

          order_id:
            data?.order_id,

          cf_order_id:
            data?.cf_order_id,

          status:
            data?.order_status,

          session_received:
            Boolean(
              data
                ?.payment_session_id
            )

        }
      );


      /* =========================================
         CHECK SESSION
      ========================================= */

      if (
        !data
          ?.payment_session_id
      ) {

        return res
          .status(502)
          .json({

            success:
              false,

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

          success:
            true,

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
            "production"

        });


    }
    catch (error) {


      const cashfreeError =
        error
          .response
          ?.data ||
        null;


      console.error(
        "CREATE ORDER ERROR:",
        cashfreeError ||
        error.message
      );


      return res
        .status(
          error
            .response
            ?.status ||
          500
        )
        .json({

          success:
            false,

          message:
            cashfreeError
              ?.message ||

            error
              .message ||

            "Unable to create Cashfree order",

          code:
            cashfreeError
              ?.code ||
            null,

          type:
            cashfreeError
              ?.type ||
            null,

          cashfree_error:
            cashfreeError

        });

    }

  }
);


/* =====================================================
   VERIFY PAYMENT
===================================================== */

app.get(
  "/verify-payment/:orderId",

  async (
    req,
    res
  ) => {

    try {


      const orderId =
        String(
          req.params
            .orderId ||
          ""
        )
          .trim();


      if (
        !orderId
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            paid:
              false,

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

            success:
              false,

            paid:
              false,

            message:
              "Cashfree production API keys missing"

          });

      }


      /* =========================================
         GET ORDER STATUS
      ========================================= */

      const response =
        await axios.get(

          `${CASHFREE_BASE_URL}/orders/${encodeURIComponent(
            orderId
          )}`,

          {

            headers: {

              "Accept":
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


      const orderStatus =
        String(
          data
            ?.order_status ||
          ""
        )
          .toUpperCase();


      console.log(
        "Verify Payment:",
        {

          order_id:
            orderId,

          status:
            orderStatus

        }
      );


      /* =========================================
         PAID
      ========================================= */

      if (
        orderStatus ===
        "PAID"
      ) {

        return res
          .status(200)
          .json({

            success:
              true,

            verified:
              true,

            paid:
              true,

            processing:
              false,

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
              "production"

          });

      }


      /* =========================================
         ACTIVE
      ========================================= */

      if (
        orderStatus ===
        "ACTIVE"
      ) {

        return res
          .status(200)
          .json({

            success:
              true,

            verified:
              true,

            paid:
              false,

            processing:
              true,

            order_id:
              data.order_id,

            order_status:
              orderStatus,

            order_amount:
              data.order_amount,

            message:
              "Payment is pending"

          });

      }


      /* =========================================
         EXPIRED
      ========================================= */

      if (
        orderStatus ===
        "EXPIRED"
      ) {

        return res
          .status(200)
          .json({

            success:
              true,

            verified:
              true,

            paid:
              false,

            processing:
              false,

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

          success:
            true,

          verified:
            true,

          paid:
            false,

          processing:
            false,

          order_id:
            data.order_id,

          order_status:
            orderStatus,

          order_amount:
            data.order_amount,

          message:
            "Payment not completed"

        });


    }
    catch (error) {


      const cashfreeError =
        error
          .response
          ?.data ||
        null;


      console.error(
        "VERIFY PAYMENT ERROR:",
        cashfreeError ||
        error.message
      );


      return res
        .status(
          error
            .response
            ?.status ||
          500
        )
        .json({

          success:
            false,

          verified:
            false,

          paid:
            false,

          message:
            cashfreeError
              ?.message ||

            error
              .message ||

            "Unable to verify payment",

          cashfree_error:
            cashfreeError

        });

    }

  }
);


/* =====================================================
   404
===================================================== */

app.use(
  (
    req,
    res
  ) => {

    return res
      .status(404)
      .json({

        success:
          false,

        message:
          "Route not found"

      });

  }
);


/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "SERVER ERROR:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }


    return res
      .status(500)
      .json({

        success:
          false,

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
      "Cashfree mode: production"
    );

    console.log(
      `Cashfree API URL: ${CASHFREE_BASE_URL}`
    );

    console.log(
      "Webhook URL:"
    );

    console.log(
      "https://cashfreebackend-l9r0.onrender.com/cashfree-webhook"
    );

  }
);
