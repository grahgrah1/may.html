/* =====================================================
   SUPABASE CONFIG
===================================================== */

const SUPABASE_URL =
  "https://trhzvzmwymnttlamdnar.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_uZqlWakHz1pqoiZqOTe3Aw_ZazllG12";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* =====================================================
   AUTHENTICATION
===================================================== */

const loginScreen =
  document.getElementById(
    "loginScreen"
  );

const appScreen =
  document.getElementById(
    "appScreen"
  );

const loginEmail =
  document.getElementById(
    "loginEmail"
  );

const loginPassword =
  document.getElementById(
    "loginPassword"
  );

const loginButton =
  document.getElementById(
    "loginButton"
  );

const loginMessage =
  document.getElementById(
    "loginMessage"
  );

const logoutButton =
  document.getElementById(
    "logoutButton"
  );

const currentUserEmail =
  document.getElementById(
    "currentUserEmail"
  );

let appInitialized = false;


function showLogin() {

  loginScreen.style.display =
    "flex";

  appScreen.style.display =
    "none";

  currentUserEmail.textContent =
    "-";
}


function showApp(user) {

  loginScreen.style.display =
    "none";

  appScreen.style.display =
    "block";

  currentUserEmail.textContent =
    user?.email ||
    "ผู้ใช้งาน";
}


async function initializeApp() {

  if (appInitialized) {
    return;
  }

  appInitialized = true;

  try {

    updateConditionalFields();

    await loadData();

    renderAll();

    fetchLiveGoldPrice();

  } catch(error) {

    appInitialized = false;

    console.error(error);

    alert(
      "ไม่สามารถโหลดข้อมูลสินค้าจาก Supabase ได้ กรุณาลองใหม่"
    );
  }
}


async function login() {

  const email =
    loginEmail.value.trim();

  const password =
    loginPassword.value;

  if (!email || !password) {

    loginMessage.textContent =
      "กรุณากรอก Email และ Password";

    return;
  }

  loginButton.disabled = true;

  loginButton.textContent =
    "กำลังเข้าสู่ระบบ...";

  loginMessage.textContent = "";

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth
        .signInWithPassword({
          email,
          password
        });

    if (error) {
      throw error;
    }

    showApp(data.user);

    await initializeApp();

    loginPassword.value = "";

  } catch(error) {

    console.error(error);

    loginMessage.textContent =
      "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบ Email หรือ Password";

  } finally {

    loginButton.disabled = false;

    loginButton.textContent =
      "เข้าสู่ระบบ";
  }
}


async function logout() {

  logoutButton.disabled = true;

  try {

    const { error } =
      await supabaseClient.auth
        .signOut();

    if (error) {
      throw error;
    }

    products = [];

    appInitialized = false;

    resetForm();

    renderAll();

    showLogin();

    loginEmail.focus();

  } catch(error) {

    console.error(error);

    alert(
      "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่"
    );

  } finally {

    logoutButton.disabled = false;
  }
}


async function checkLogin() {

  const {
    data: {
      session
    },
    error
  } =
    await supabaseClient.auth
      .getSession();

  if (error) {

    console.error(error);

    showLogin();

    return;
  }

  if (session?.user) {

    showApp(session.user);

    await initializeApp();

  } else {

    showLogin();
  }
}


loginButton.addEventListener(
  "click",
  login
);


/* กด Enter ที่ช่อง Email -> ไปช่อง Password */

loginEmail.addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {

      event.preventDefault();

      loginPassword.focus();
    }
  }
);


/* กด Enter ที่ช่อง Password -> เข้าสู่ระบบ */

loginPassword.addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {

      event.preventDefault();

      login();
    }
  }
);


logoutButton.addEventListener(
  "click",
  logout
);


supabaseClient.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    if (
      event === "SIGNED_OUT" ||
      !session
    ) {

      appInitialized = false;

      products = [];

      showLogin();
    }
  }
);


/* =====================================================
   LOCAL CACHE
   ใช้ localStorage เฉพาะ cache ราคาทองเท่านั้น
   ข้อมูลสินค้าเก็บใน Supabase Database
===================================================== */

const GOLD_LIVE_CACHE_KEY =
  "goldPawnLivePriceCacheV1";

let products = [];

let editingId = null;

/* URL รูปที่บันทึกอยู่ในฐานข้อมูล */
let selectedImage = "";

/* ไฟล์รูปใหม่ที่ผู้ใช้เพิ่งเลือก */
let selectedImageFile = null;

/* Object URL สำหรับ preview รูปในเครื่องก่อนอัปโหลด */
let selectedImagePreviewUrl = "";

const PRODUCT_IMAGE_BUCKET =
  "product-images";


/* =====================================================
   SUPABASE STORAGE - PRODUCT IMAGES
===================================================== */

function getSafeImageExtension(file) {

  const fileName =
    String(
      file?.name || ""
    );

  const rawExtension =
    fileName.includes(".")
      ? fileName
          .split(".")
          .pop()
          .toLowerCase()
      : "";

  const allowedExtensions = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif"
  ];

  if (
    allowedExtensions.includes(
      rawExtension
    )
  ) {
    return rawExtension;
  }

  const mimeExtensionMap = {
    "image/jpeg":"jpg",
    "image/png":"png",
    "image/webp":"webp",
    "image/gif":"gif"
  };

  return (
    mimeExtensionMap[
      file?.type
    ] ||
    "jpg"
  );
}


async function uploadProductImage(file) {

  if (!file) {
    return null;
  }

  const {
    data: {
      user
    },
    error: userError
  } =
    await supabaseClient.auth
      .getUser();

  if (
    userError ||
    !user
  ) {

    throw new Error(
      "ไม่พบผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"
    );
  }

  const extension =
    getSafeImageExtension(
      file
    );

  const path =
    `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const {
    error: uploadError
  } =
    await supabaseClient.storage
      .from(
        PRODUCT_IMAGE_BUCKET
      )
      .upload(
        path,
        file,
        {
          cacheControl:"3600",
          upsert:false,
          contentType:
            file.type ||
            undefined
        }
      );

  if (uploadError) {
    throw uploadError;
  }

  const {
    data: publicUrlData
  } =
    supabaseClient.storage
      .from(
        PRODUCT_IMAGE_BUCKET
      )
      .getPublicUrl(
        path
      );

  const url =
    publicUrlData
      ?.publicUrl;

  if (!url) {

    await supabaseClient.storage
      .from(
        PRODUCT_IMAGE_BUCKET
      )
      .remove([
        path
      ]);

    throw new Error(
      "ไม่สามารถสร้าง URL ของรูปสินค้าได้"
    );
  }

  return {
    url,
    path
  };
}


function getStoragePathFromPublicUrl(
  imageUrl
) {

  if (!imageUrl) {
    return "";
  }

  const marker =
    `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;

  const markerIndex =
    imageUrl.indexOf(
      marker
    );

  if (
    markerIndex === -1
  ) {
    return "";
  }

  return decodeURIComponent(
    imageUrl.slice(
      markerIndex +
      marker.length
    )
  );
}


async function deleteStoredProductImage(
  imageUrl
) {

  const path =
    getStoragePathFromPublicUrl(
      imageUrl
    );

  if (!path) {
    return;
  }

  const {
    error
  } =
    await supabaseClient.storage
      .from(
        PRODUCT_IMAGE_BUCKET
      )
      .remove([
        path
      ]);

  if (error) {

    console.warn(
      "ลบรูปจาก Supabase Storage ไม่สำเร็จ",
      error
    );
  }
}


function clearImagePreviewObjectUrl() {

  if (
    selectedImagePreviewUrl
  ) {

    URL.revokeObjectURL(
      selectedImagePreviewUrl
    );

    selectedImagePreviewUrl = "";
  }
}


/* =====================================================
   SUPABASE PRODUCT MAPPING
===================================================== */

function databaseRowToProduct(row) {

  return {

    id:
      row.id,

    code:
      row.code || "",

    name:
      row.name || "",

    type:
      row.type ||
      "เบ็ดเตล็ด",

    karat:
      row.karat || "",

    weight:
      Number(
        row.weight || 0
      ),

    unit:
      row.unit ||
      "ชิ้น",

    cost:
      Number(
        row.cost || 0
      ),

    interest:
      Number(
        row.interest || 0
      ),

    salePrice:
      Number(
        row.sale_price || 0
      ),

    costPerBaht:
      Number(
        row.cost_per_baht || 0
      ),

    image:
      row.image_url || "",

    createdAt:
      row.created_at

  };
}


function createDatabaseProductPayload({
  code,
  name,
  type,
  karat,
  productUnit,
  productWeight,
  productCost,
  productInterest,
  productSalePrice,
  costPerBaht,
  imageUrl
}) {

  return {

    code,

    name,

    type,

    karat:
      isGoldProductType(type)
        ? karat
        : null,

    weight:
      productWeight,

    unit:
      productUnit,

    cost:
      productCost,

    interest:
      productInterest,

    sale_price:
      productSalePrice,

    cost_per_baht:
      costPerBaht,

    image_url:
      imageUrl ||
      null

  };
}


/* =====================================================
   GOLD API
===================================================== */

const GOLD_API_URL =
  [
    "https:",
    "",
    "www.thaigoldtoday.com",
    "api",
    "gold-price"
  ].join("/");

const GOLD_API_FALLBACK =
  [
    "https:",
    "",
    "api.chnwt.dev",
    "thai-gold-api",
    "latest"
  ].join("/");

const GOLD_SOURCE_URL =
  [
    "https:",
    "",
    "www.thaigoldtoday.com"
  ].join("/");


/* =====================================================
   GOLD ELEMENTS
===================================================== */

const goldSellPrice =
  document.getElementById(
    "goldSellPrice"
  );

const goldBuyPrice =
  document.getElementById(
    "goldBuyPrice"
  );

const goldPriceStatus =
  document.getElementById(
    "goldPriceStatus"
  );

const refreshGoldButton =
  document.getElementById(
    "refreshGoldButton"
  );

const goldSourceText =
  document.getElementById(
    "goldSourceText"
  );

const goldSourceLink =
  document.getElementById(
    "goldSourceLink"
  );

goldSourceLink.href =
  GOLD_SOURCE_URL;


/* =====================================================
   GOLD FORMAT
===================================================== */

function formatGoldPrice(value) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "--";
  }

  return number.toLocaleString(
    "th-TH",
    {
      maximumFractionDigits:2
    }
  );
}


/* =====================================================
   DATE FORMAT
===================================================== */

function formatGoldDate(value) {

  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "th-TH",
    {
      timeZone:"Asia/Bangkok",
      day:"2-digit",
      month:"2-digit",
      year:"numeric",
      hour:"2-digit",
      minute:"2-digit"
    }
  )
  .format(date);
}


/* =====================================================
   DISPLAY LIVE GOLD
===================================================== */

function renderLiveGoldPrice(
  data,
  cached = false
) {

  goldSellPrice.textContent =
    formatGoldPrice(
      data.sell
    );

  goldBuyPrice.textContent =
    formatGoldPrice(
      data.buy
    ) +
    " บาท";

  let status =
    cached
      ? "ข้อมูลล่าสุดที่บันทึกไว้"
      : "อัปเดต";

  if (data.updatedAt) {

    status +=
      " " +
      formatGoldDate(
        data.updatedAt
      );
  }

  if (data.round) {

    status +=
      ` • ครั้งที่ ${data.round}`;
  }

  goldPriceStatus.textContent =
    status;

  goldSourceText.textContent =
    data.source ||
    "ข้อมูลราคาทองประเทศไทย";
}


/* =====================================================
   PRIMARY GOLD API
===================================================== */

async function fetchPrimaryGoldPrice() {

  const response =
    await fetch(
      GOLD_API_URL +
      "?t=" +
      Date.now(),
      {
        cache:"no-store"
      }
    );

  if (!response.ok) {

    throw new Error(
      "Primary API error"
    );
  }

  const json =
    await response.json();

  const current =
    json.current;

  if (
    !current ||
    !Number.isFinite(
      Number(
        current.sellBar
      )
    )
  ) {

    throw new Error(
      "Invalid primary data"
    );
  }

  return {

    buy:
      Number(
        current.buyBar
      ),

    sell:
      Number(
        current.sellBar
      ),

    round:
      current.updateRound ||
      "",

    updatedAt:
      current.updatedAt ||
      "",

    source:
      "ข้อมูลราคาทองประเทศไทย"

  };
}


/* =====================================================
   FALLBACK GOLD API
===================================================== */

async function fetchFallbackGoldPrice() {

  const response =
    await fetch(
      GOLD_API_FALLBACK +
      "?t=" +
      Date.now(),
      {
        cache:"no-store"
      }
    );

  if (!response.ok) {

    throw new Error(
      "Fallback API error"
    );
  }

  const json =
    await response.json();

  const responseData =
    json.response;

  const bar =
    responseData
      ?.price
      ?.gold_bar;

  if (!bar) {

    throw new Error(
      "Invalid fallback data"
    );
  }

  const buy =
    Number(
      String(
        bar.buy
      )
      .replace(
        /,/g,
        ""
      )
    );

  const sell =
    Number(
      String(
        bar.sell
      )
      .replace(
        /,/g,
        ""
      )
    );

  if (
    !Number.isFinite(buy) ||
    !Number.isFinite(sell)
  ) {

    throw new Error(
      "Invalid fallback price"
    );
  }

  return {

    buy,

    sell,

    round:"",

    updatedAt:
      responseData.update_date +
      " " +
      responseData.update_time,

    source:
      "ข้อมูลราคาทองประเทศไทย"

  };
}


/* =====================================================
   FETCH GOLD
===================================================== */

async function fetchLiveGoldPrice() {

  refreshGoldButton.classList.add(
    "loading"
  );

  goldPriceStatus.textContent =
    "กำลังอัปเดตราคาทอง...";

  try {

    let data;

    try {

      data =
        await fetchPrimaryGoldPrice();

    } catch {

      data =
        await fetchFallbackGoldPrice();
    }

    renderLiveGoldPrice(
      data
    );

    localStorage.setItem(
      GOLD_LIVE_CACHE_KEY,
      JSON.stringify(
        data
      )
    );

  } catch(error) {

    console.error(error);

    const cached =
      localStorage.getItem(
        GOLD_LIVE_CACHE_KEY
      );

    if (cached) {

      try {

        renderLiveGoldPrice(
          JSON.parse(
            cached
          ),
          true
        );

      } catch {

        goldPriceStatus.textContent =
          "ไม่สามารถโหลดราคาทองได้";
      }

    } else {

      goldSellPrice.textContent =
        "--";

      goldBuyPrice.textContent =
        "--";

      goldPriceStatus.textContent =
        "ไม่สามารถโหลดราคาทองได้";
    }

  } finally {

    refreshGoldButton.classList.remove(
      "loading"
    );
  }
}


refreshGoldButton.addEventListener(
  "click",
  fetchLiveGoldPrice
);


setInterval(
  fetchLiveGoldPrice,
  60 * 1000
);


/* =====================================================
   PRODUCT ELEMENTS
===================================================== */

const productCode =
  document.getElementById(
    "productCode"
  );

const productName =
  document.getElementById(
    "productName"
  );

const productType =
  document.getElementById(
    "productType"
  );

const goldKarat =
  document.getElementById(
    "goldKarat"
  );

const goldKaratGroup =
  document.getElementById(
    "goldKaratGroup"
  );

const goldDetailsRow =
  document.getElementById(
    "goldDetailsRow"
  );

const weight =
  document.getElementById(
    "weight"
  );

const unit =
  document.getElementById(
    "unit"
  );

const cost =
  document.getElementById(
    "cost"
  );

const interest =
  document.getElementById(
    "interest"
  );

const interestGroup =
  document.getElementById(
    "interestGroup"
  );

const salePrice =
  document.getElementById(
    "salePrice"
  );

const saveButton =
  document.getElementById(
    "saveButton"
  );

const cancelEditButton =
  document.getElementById(
    "cancelEditButton"
  );

const formTitle =
  document.getElementById(
    "formTitle"
  );

const imageInput =
  document.getElementById(
    "imageInput"
  );

const imagePreview =
  document.getElementById(
    "imagePreview"
  );

const tableBody =
  document.getElementById(
    "tableBody"
  );

const emptyState =
  document.getElementById(
    "emptyState"
  );

const searchInput =
  document.getElementById(
    "searchInput"
  );

const typeFilter =
  document.getElementById(
    "typeFilter"
  );

const karatFilter =
  document.getElementById(
    "karatFilter"
  );

const sortSelect =
  document.getElementById(
    "sortSelect"
  );

const exportButton =
  document.getElementById(
    "exportButton"
  );

const totalItems =
  document.getElementById(
    "totalItems"
  );

const totalCost =
  document.getElementById(
    "totalCost"
  );

const totalWeight =
  document.getElementById(
    "totalWeight"
  );

const averageCost =
  document.getElementById(
    "averageCost"
  );

const chart =
  document.getElementById(
    "costChart"
  );

const imageModal =
  document.getElementById(
    "imageModal"
  );

const imageModalImage =
  document.getElementById(
    "imageModalImage"
  );

const imageModalClose =
  document.getElementById(
    "imageModalClose"
  );


/* =====================================================
   PRODUCT IMAGE LIGHTBOX
===================================================== */

function openProductImage(
  imageUrl
) {

  if (!imageUrl) {
    return;
  }

  imageModalImage.src =
    imageUrl;

  imageModal.classList.add(
    "open"
  );

  imageModal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow =
    "hidden";
}


function closeProductImage() {

  imageModal.classList.remove(
    "open"
  );

  imageModal.setAttribute(
    "aria-hidden",
    "true"
  );

  imageModalImage.src = "";

  document.body.style.overflow = "";
}


imageModalClose.addEventListener(
  "click",
  closeProductImage
);


imageModal.addEventListener(
  "click",
  event => {

    if (
      event.target === imageModal ||
      event.target === imageModalImage
    ) {

      closeProductImage();
    }
  }
);


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape" &&
      imageModal.classList.contains(
        "open"
      )
    ) {

      closeProductImage();
    }
  }
);


tableBody.addEventListener(
  "click",
  event => {

    const clickedImage =
      event.target.closest(
        ".product-image-clickable"
      );

    if (!clickedImage) {
      return;
    }

    openProductImage(
      clickedImage.dataset.imageUrl
    );
  }
);


/* =====================================================
   GOLD FIELD VISIBILITY
===================================================== */

function isGoldProductType(type) {

  return (
    type === "ทองคำ" ||
    type === "หลุดทองคำ"
  );
}


function updateGoldKaratVisibility() {

  const showGoldFields =
    isGoldProductType(
      productType.value
    );

  goldDetailsRow.style.display =
    showGoldFields
      ? "grid"
      : "none";

  goldKarat.disabled =
    !showGoldFields;

  weight.disabled =
    !showGoldFields;
}


function isLostProductType(type) {

  return (
    type === "หลุดเบ็ดเตล็ด" ||
    type === "หลุดทองคำ"
  );
}


function updateInterestVisibility() {

  const showInterest =
    isLostProductType(
      productType.value
    );

  interestGroup.style.display =
    showInterest
      ? "block"
      : "none";

  interest.disabled =
    !showInterest;
}


function updateConditionalFields() {

  updateGoldKaratVisibility();

  updateInterestVisibility();
}


productType.addEventListener(
  "change",
  updateConditionalFields
);


/* =====================================================
   NUMBER
===================================================== */

function parseNumber(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  const cleaned =
    String(value)
      .replace(
        /,/g,
        ""
      )
      .replace(
        /\s/g,
        ""
      )
      .trim();

  const number =
    Number(
      cleaned
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function numberFormat(value) {

  return Number(
    value || 0
  )
  .toLocaleString(
    "th-TH",
    {
      maximumFractionDigits:2
    }
  );
}


/* =====================================================
   COST PER BAHT
===================================================== */

function calculateCostPerBaht(
  productCost,
  productWeight
) {

  const c =
    parseNumber(
      productCost
    );

  const w =
    parseNumber(
      productWeight
    );

  if (
    c <= 0 ||
    w <= 0
  ) {
    return 0;
  }

  return Math.ceil(
    c /
    w *
    15.2
  );
}


/* =====================================================
   IMAGE
===================================================== */

imageInput.addEventListener(
  "change",
  () => {

    const file =
      imageInput.files[0];

    if (!file) {
      return;
    }

    const allowedImageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (
      !allowedImageTypes.includes(
        file.type
      )
    ) {

      alert(
        "รองรับเฉพาะ JPG, PNG, WEBP และ GIF"
      );

      imageInput.value = "";

      return;
    }

    if (
      file.size >
      2 *
      1024 *
      1024
    ) {

      alert(
        "รูปใหญ่เกินไป กรุณาใช้รูปไม่เกิน 2 MB"
      );

      imageInput.value = "";

      return;
    }

    clearImagePreviewObjectUrl();

    selectedImageFile =
      file;

    selectedImagePreviewUrl =
      URL.createObjectURL(
        file
      );

    imagePreview.src =
      selectedImagePreviewUrl;

    imagePreview.style.display =
      "block";
  }
);


/* =====================================================
   PRODUCT CODE - PREVENT DUPLICATES
===================================================== */

function normalizeProductCode(value) {

  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
}


function hasDuplicateProductCode(code) {

  const normalizedCode =
    normalizeProductCode(
      code
    );

  return products.some(
    item =>
      item.id !== editingId &&
      normalizeProductCode(
        item.code
      ) === normalizedCode
  );
}


/* =====================================================
   SAVE PRODUCT - SUPABASE
===================================================== */

saveButton.addEventListener(
  "click",
  saveProduct
);


async function saveProduct() {

  const code =
    normalizeProductCode(
      productCode.value
    );

  productCode.value =
    code;

  const name =
    productName.value
      .trim();

  const type =
    productType.value;

  const karat =
    isGoldProductType(type)
      ? goldKarat.value
      : "";

  const productUnit =
    unit.value;

  const productWeight =
    isGoldProductType(type)
      ? parseNumber(
          weight.value
        )
      : 0;

  const productCost =
    parseNumber(
      cost.value
    );

  const productInterest =
    isLostProductType(type)
      ? parseNumber(
          interest.value
        )
      : 0;

  const productSalePrice =
    parseNumber(
      salePrice.value
    );

  if (!code) {

    alert(
      "กรุณากรอกรหัสสินค้า"
    );

    productCode.focus();

    return;
  }

  if (
    hasDuplicateProductCode(
      code
    )
  ) {

    alert(
      `รหัสสินค้า ${code} มีอยู่แล้ว\nกรุณาใช้รหัสสินค้าอื่น`
    );

    productCode.focus();

    productCode.select();

    return;
  }

  if (!name) {

    alert(
      "กรุณากรอกชื่อสินค้า"
    );

    productName.focus();

    return;
  }

  if (
    isGoldProductType(type) &&
    productWeight <= 0
  ) {

    alert(
      "กรุณากรอกน้ำหนัก เช่น 15.08"
    );

    weight.focus();

    return;
  }

  if (
    productCost <= 0
  ) {

    alert(
      "กรุณากรอกต้นทุนซื้อ เช่น 56,375"
    );

    cost.focus();

    return;
  }

  const costPerBaht =
    isGoldProductType(type)
      ? calculateCostPerBaht(
          productCost,
          productWeight
        )
      : 0;

  const previousImageUrl =
    selectedImage;

  let uploadedImage =
    null;

  let imageUrl =
    selectedImage;

  const originalButtonText =
    saveButton.textContent;

  saveButton.disabled =
    true;

  saveButton.textContent =
    editingId
      ? "กำลังบันทึกการแก้ไข..."
      : "กำลังบันทึก...";

  try {

    if (
      selectedImageFile
    ) {

      saveButton.textContent =
        "กำลังอัปโหลดรูป...";

      uploadedImage =
        await uploadProductImage(
          selectedImageFile
        );

      imageUrl =
        uploadedImage.url;

      saveButton.textContent =
        editingId
          ? "กำลังบันทึกการแก้ไข..."
          : "กำลังบันทึก...";
    }

    const payload =
      createDatabaseProductPayload({
        code,
        name,
        type,
        karat,
        productUnit,
        productWeight,
        productCost,
        productInterest,
        productSalePrice,
        costPerBaht,
        imageUrl
      });

    let data;

    let error;

    if (editingId) {

      const result =
        await supabaseClient
          .from("products")
          .update(
            payload
          )
          .eq(
            "id",
            editingId
          )
          .select("*")
          .single();

      data =
        result.data;

      error =
        result.error;

    } else {

      const result =
        await supabaseClient
          .from("products")
          .insert(
            payload
          )
          .select("*")
          .single();

      data =
        result.data;

      error =
        result.error;
    }

    if (error) {
      throw error;
    }

    const savedProduct =
      databaseRowToProduct(
        data
      );

    if (editingId) {

      const index =
        products.findIndex(
          item =>
            item.id === editingId
        );

      if (
        index !== -1
      ) {

        products[index] =
          savedProduct;
      }

      if (
        uploadedImage &&
        previousImageUrl &&
        previousImageUrl !==
          imageUrl
      ) {

        await deleteStoredProductImage(
          previousImageUrl
        );
      }

    } else {

      products.unshift(
        savedProduct
      );
    }

    renderAll();

    resetForm();

  } catch(error) {

    console.error(error);

    if (
      uploadedImage?.url
    ) {

      await deleteStoredProductImage(
        uploadedImage.url
      );
    }

    if (
      error?.code === "23505"
    ) {

      alert(
        `รหัสสินค้า ${code} มีอยู่แล้ว\nกรุณาใช้รหัสสินค้าอื่น`
      );

      productCode.focus();

      productCode.select();

    } else {

      const message =
        error?.message ||
        "Unknown error";

      alert(
        "บันทึกข้อมูลไม่สำเร็จ\n\n" +
        message
      );
    }

  } finally {

    saveButton.disabled =
      false;

    if (
      editingId
    ) {

      saveButton.textContent =
        originalButtonText;

    } else {

      saveButton.textContent =
        "บันทึกรายการ";
    }
  }
}


/* =====================================================
   RESET
===================================================== */

function clearProductEntryFields() {

  clearImagePreviewObjectUrl();

  selectedImage = "";

  selectedImageFile = null;

  productCode.value = "";

  productName.value = "";

  weight.value = "";

  cost.value = "";

  interest.value = "";

  salePrice.value = "";

  imageInput.value = "";

  imagePreview.src = "";

  imagePreview.style.display =
    "none";
}


function resetForm() {

  editingId = null;

  productType.value =
    "เบ็ดเตล็ด";

  goldKarat.value =
    "24K";

  unit.value =
    "ชิ้น";

  clearProductEntryFields();

  updateConditionalFields();

  formTitle.textContent =
    "➕ เพิ่มรายการสินค้า";

  saveButton.textContent =
    "บันทึกรายการ";

  cancelEditButton.style.display =
    "none";

  if (
    document.activeElement &&
    typeof document.activeElement.blur === "function"
  ) {

    document.activeElement.blur();
  }
}


/* =====================================================
   EDIT
===================================================== */

function editProduct(id) {

  const product =
    products.find(
      item =>
        item.id === id
    );

  if (!product) {
    return;
  }

  editingId =
    product.id;

  productCode.value =
    product.code;

  productName.value =
    product.name || "";

  productType.value =
    product.type;

  goldKarat.value =
    product.karat ||
    "24K";

  updateConditionalFields();

  weight.value =
    product.weight;

  unit.value =
    product.unit ||
    "ชิ้น";

  cost.value =
    numberFormat(
      product.cost
    );

  interest.value =
    product.interest
      ? numberFormat(
          product.interest
        )
      : "";

  salePrice.value =
    product.salePrice
      ? numberFormat(
          product.salePrice
        )
      : "";

  clearImagePreviewObjectUrl();

  selectedImageFile =
    null;

  imageInput.value =
    "";

  selectedImage =
    product.image || "";

  if (
    selectedImage
  ) {

    imagePreview.src =
      selectedImage;

    imagePreview.style.display =
      "block";

  } else {

    imagePreview.style.display =
      "none";
  }

  formTitle.textContent =
    "✏️ แก้ไขรายการ";

  saveButton.textContent =
    "บันทึกการแก้ไข";

  cancelEditButton.style.display =
    "block";

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });
}


cancelEditButton.addEventListener(
  "click",
  resetForm
);


/* =====================================================
   DELETE - SUPABASE
===================================================== */

async function deleteProduct(id) {

  const product =
    products.find(
      item =>
        item.id === id
    );

  if (!product) {
    return;
  }

  if (
    !confirm(
      `ต้องการลบสินค้า ${product.code}${product.name ? ` - ${product.name}` : ""} หรือไม่?`
    )
  ) {
    return;
  }

  try {

    const {
      error
    } =
      await supabaseClient
        .from("products")
        .delete()
        .eq(
          "id",
          id
        );

    if (error) {
      throw error;
    }

    if (
      product.image
    ) {

      await deleteStoredProductImage(
        product.image
      );
    }

    products =
      products.filter(
        item =>
          item.id !== id
      );

    if (
      editingId === id
    ) {

      resetForm();
    }

    renderAll();

  } catch(error) {

    console.error(error);

    alert(
      "ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่"
    );
  }
}


/* =====================================================
   LOAD PRODUCTS - SUPABASE
===================================================== */

async function loadData() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("products")
      .select("*")
      .order(
        "created_at",
        {
          ascending:false
        }
      );

  if (error) {
    throw error;
  }

  products =
    (data || [])
      .map(
        databaseRowToProduct
      );
}


/* =====================================================
   FILTER
===================================================== */

function getFilteredProducts() {

  const search =
    searchInput.value
      .trim()
      .toLowerCase();

  const type =
    typeFilter.value;

  const karat =
    karatFilter.value;

  let result =
    products.filter(
      item => {

        const matchSearch =
          item.code
            .toLowerCase()
            .includes(
              search
            ) ||
          String(
            item.name || ""
          )
            .toLowerCase()
            .includes(
              search
            );

        const matchType =
          !type ||
          item.type === type;

        const matchKarat =
          !karat ||
          (
            isGoldProductType(item.type) &&
            (item.karat || "24K") ===
            karat
          );

        return (
          matchSearch &&
          matchType &&
          matchKarat
        );
      }
    );

  switch(
    sortSelect.value
  ) {

    case "cost-high":

      result.sort(
        (a,b) =>
          b.costPerBaht -
          a.costPerBaht
      );

      break;

    case "cost-low":

      result.sort(
        (a,b) =>
          a.costPerBaht -
          b.costPerBaht
      );

      break;

    case "weight-high":

      result.sort(
        (a,b) =>
          b.weight -
          a.weight
      );

      break;

    default:

      result.sort(
        (a,b) =>
          new Date(
            b.createdAt
          ) -
          new Date(
            a.createdAt
          )
      );
  }

  return result;
}


searchInput.addEventListener(
  "input",
  renderAll
);

typeFilter.addEventListener(
  "change",
  renderAll
);

karatFilter.addEventListener(
  "change",
  renderAll
);

sortSelect.addEventListener(
  "change",
  renderAll
);


/* =====================================================
   TYPE BADGE CLASS
===================================================== */

function getTypeBadgeClass(type) {

  switch(type) {

    case "ทองคำ":
      return "badge-gold";

    case "หลุดเบ็ดเตล็ด":
      return "badge-lost-misc";

    case "หลุดทองคำ":
      return "badge-lost-gold";

    default:
      return "badge-misc";
  }
}


/* =====================================================
   TABLE
===================================================== */

function renderTable() {

  const list =
    getFilteredProducts();

  tableBody.innerHTML =
    "";

  emptyState.style.display =
    list.length
      ? "none"
      : "block";

  list.forEach(
    product => {

      const tr =
        document.createElement(
          "tr"
        );

      const date =
        new Date(
          product.createdAt
        )
        .toLocaleDateString(
          "th-TH"
        );

      const imageHTML =
        product.image
          ?
          `
          <img
            class="product-image product-image-clickable"
            src="${escapeHTML(product.image)}"
            data-image-url="${escapeHTML(product.image)}"
            alt="${escapeHTML(product.name || product.code || "สินค้า")}"
            title="คลิกเพื่อขยายรูป"
          >
          `
          :
          `
          <div class="no-image">
            📦
          </div>
          `;

      const typeClass =
        getTypeBadgeClass(
          product.type
        );

      tr.innerHTML =
      `

      <td>

        <div class="product-cell">

          ${imageHTML}

          <div>

            <div class="code">
              ${escapeHTML(product.code)}
            </div>

            <div class="product-name">
              ${escapeHTML(product.name || "ไม่ระบุชื่อ")}
            </div>

          </div>

        </div>

      </td>


      <td>

        <span class="badge ${typeClass}">
          ${escapeHTML(product.type)}
        </span>

      </td>


      <td>

        <span class="karat-badge">
          ${
            isGoldProductType(product.type)
              ? (product.karat || "24K")
              : "-"
          }
        </span>

      </td>


      <td>
        ${
          isGoldProductType(product.type)
            ? numberFormat(product.weight) + " g"
            : "-"
        }
      </td>


      <td>
        ${escapeHTML(product.unit || "ชิ้น")}
      </td>


      <td>
        ${numberFormat(product.cost)}
      </td>


      <td>
        ${numberFormat(product.interest || 0)}
      </td>


      <td>
        ${numberFormat(product.salePrice || 0)}
      </td>


      <td class="cost-baht">
        ${
          isGoldProductType(product.type)
            ? numberFormat(product.costPerBaht)
            : "-"
        }
      </td>


      <td>
        ${date}
      </td>


      <td>

        <div class="actions">

          <button
            class="action-btn edit-btn"
            onclick="editProduct('${product.id}')"
          >
            ✏️
          </button>


          <button
            class="action-btn delete-btn"
            onclick="deleteProduct('${product.id}')"
          >
            🗑️
          </button>

        </div>

      </td>

      `;

      tableBody.appendChild(
        tr
      );
    }
  );
}


/* =====================================================
   KPI
===================================================== */

function renderKPI() {

  const count =
    products.length;

  const sumCost =
    products.reduce(
      (sum,item) =>
        sum +
        Number(
          item.cost
        ),
      0
    );

  const goldProducts =
    products.filter(
      item =>
        isGoldProductType(
          item.type
        )
    );

  const sumWeight =
    goldProducts.reduce(
      (sum,item) =>
        sum +
        Number(
          item.weight
        ),
      0
    );

  const goldCost =
    goldProducts.reduce(
      (sum,item) =>
        sum +
        Number(
          item.cost
        ),
      0
    );

  const avg =
    sumWeight > 0
      ?
      Math.ceil(
        goldCost /
        sumWeight *
        15.2
      )
      :
      0;

  totalItems.textContent =
    numberFormat(
      count
    );

  totalCost.textContent =
    numberFormat(
      sumCost
    );

  totalWeight.textContent =
    numberFormat(
      sumWeight
    );

  averageCost.textContent =
    numberFormat(
      avg
    );
}


/* =====================================================
   CHART
===================================================== */

function drawChart() {

  const ctx =
    chart.getContext(
      "2d"
    );

  const rect =
    chart.getBoundingClientRect();

  const dpr =
    window.devicePixelRatio ||
    1;

  chart.width =
    rect.width *
    dpr;

  chart.height =
    250 *
    dpr;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  const width =
    rect.width;

  const height =
    250;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const categories = [
    "เบ็ดเตล็ด",
    "ทองคำ",
    "หลุดเบ็ดเตล็ด",
    "หลุดทองคำ"
  ];

  const counts =
    categories.map(
      type =>
        products.filter(
          item =>
            item.type === type
        ).length
    );

  if (
    products.length === 0
  ) {

    ctx.fillStyle =
      "#999";

    ctx.font =
      '13px Arial,"Noto Sans Thai",sans-serif';

    ctx.textAlign =
      "center";

    ctx.fillText(
      "เพิ่มสินค้าเพื่อแสดงกราฟ",
      width / 2,
      height / 2
    );

    return;
  }

  const padding = {
    left:48,
    right:22,
    top:28,
    bottom:58
  };

  const chartWidth =
    width -
    padding.left -
    padding.right;

  const chartHeight =
    height -
    padding.top -
    padding.bottom;

  const maxCount =
    Math.max(
      ...counts,
      1
    );

  const step =
    Math.max(
      1,
      Math.ceil(
        maxCount / 4
      )
    );

  const axisMax =
    step * 4;

  ctx.strokeStyle =
    "#eae7df";

  ctx.lineWidth =
    1;

  ctx.fillStyle =
    "#888";

  ctx.font =
    '10px Arial,"Noto Sans Thai",sans-serif';

  ctx.textAlign =
    "right";

  ctx.textBaseline =
    "middle";

  for (
    let i = 0;
    i <= 4;
    i++
  ) {

    const value =
      axisMax -
      step * i;

    const y =
      padding.top +
      chartHeight / 4 * i;

    ctx.beginPath();

    ctx.moveTo(
      padding.left,
      y
    );

    ctx.lineTo(
      width -
      padding.right,
      y
    );

    ctx.stroke();

    ctx.fillText(
      String(value),
      padding.left - 8,
      y
    );
  }

  const slotWidth =
    chartWidth /
    categories.length;

  const barWidth =
    Math.min(
      78,
      slotWidth * 0.56
    );

  const barColors = [
    "#6b7f99",
    "#c49a3a",
    "#d07a38",
    "#9a1520"
  ];

  categories.forEach(
    (type,index) => {

      const count =
        counts[index];

      const barHeight =
        count /
        axisMax *
        chartHeight;

      const x =
        padding.left +
        slotWidth * index +
        (
          slotWidth -
          barWidth
        ) / 2;

      const y =
        padding.top +
        chartHeight -
        barHeight;

      ctx.fillStyle =
        barColors[index];

      ctx.beginPath();

      if (
        typeof ctx.roundRect ===
        "function"
      ) {

        ctx.roundRect(
          x,
          y,
          barWidth,
          barHeight,
          [8,8,0,0]
        );

      } else {

        ctx.rect(
          x,
          y,
          barWidth,
          barHeight
        );
      }

      ctx.fill();

      ctx.fillStyle =
        "#222";

      ctx.font =
        'bold 12px Arial,"Noto Sans Thai",sans-serif';

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "bottom";

      ctx.fillText(
        String(count),
        x +
        barWidth / 2,
        Math.max(
          y - 6,
          14
        )
      );

      ctx.fillStyle =
        "#666";

      ctx.font =
        '10px Arial,"Noto Sans Thai",sans-serif';

      ctx.textBaseline =
        "top";

      ctx.fillText(
        type,
        x +
        barWidth / 2,
        padding.top +
        chartHeight +
        13
      );
    }
  );

  ctx.fillStyle =
    "#888";

  ctx.font =
    '10px Arial,"Noto Sans Thai",sans-serif';

  ctx.textAlign =
    "left";

  ctx.textBaseline =
    "alphabetic";

  ctx.fillText(
    "จำนวน (รายการ)",
    padding.left,
    14
  );
}


/* =====================================================
   CSV
===================================================== */

exportButton.addEventListener(
  "click",
  exportCSV
);


function exportCSV() {

  if (
    products.length === 0
  ) {

    alert(
      "ยังไม่มีข้อมูลสำหรับ Export"
    );

    return;
  }

  const rows =
  [[

    "รหัสสินค้า",

    "ชื่อสินค้า",

    "ประเภท",

    "กะรัต",

    "น้ำหนักกรัม",

    "หน่วยนับ",

    "ต้นทุน",

    "ดอกเบี้ย",

    "ราคาขาย",

    "ต้นทุนต่อบาท",

    "วันที่"

  ]];

  products.forEach(
    product => {

      rows.push([

        product.code,

        product.name || "",

        product.type,

        isGoldProductType(product.type)
          ? (product.karat || "24K")
          : "",

        isGoldProductType(product.type)
          ? product.weight
          : "",

        product.unit || "ชิ้น",

        product.cost,

        product.interest || 0,

        product.salePrice || 0,

        isGoldProductType(product.type)
          ? product.costPerBaht
          : "",

        new Date(
          product.createdAt
        )
        .toLocaleDateString(
          "th-TH"
        )

      ]);
    }
  );

  const csv =
    "\uFEFF" +

    rows.map(
      row =>

        row.map(
          value =>

            `"${String(value)
            .replace(
              /"/g,
              '""'
            )}"`

        )
        .join(",")

    )
    .join("\n");

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    `gold-data-${new Date()
      .toISOString()
      .slice(0,10)}.csv`;

  link.click();

  URL.revokeObjectURL(
    url
  );
}


/* =====================================================
   SAFE HTML
===================================================== */

function escapeHTML(text) {

  return String(text)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );
}


/* =====================================================
   RENDER
===================================================== */

function renderAll() {

  renderKPI();

  renderTable();

  drawChart();
}


/* =====================================================
   KEYBOARD FORM NAVIGATION
===================================================== */

function getVisibleFormFields() {

  return Array.from(
    document.querySelectorAll(
      ".form-card input:not([type='file']), .form-card select"
    )
  )
  .filter(
    element =>
      !element.disabled &&
      element.offsetParent !== null
  );
}


function focusFormField(element) {

  if (!element) {
    return;
  }

  element.focus();

  if (
    element.tagName === "INPUT" &&
    [
      "text",
      "search",
      "number",
      "tel",
      "email"
    ].includes(
      element.type
    )
  ) {

    element.select();
  }
}


function focusNextFormField(currentElement) {

  const fields =
    getVisibleFormFields();

  const currentIndex =
    fields.indexOf(
      currentElement
    );

  if (
    currentIndex === -1
  ) {
    return;
  }

  const nextField =
    fields[
      currentIndex + 1
    ];

  if (nextField) {

    focusFormField(
      nextField
    );

  } else {

    saveButton.focus();
  }
}


function focusPreviousFormField(currentElement) {

  const fields =
    getVisibleFormFields();

  const currentIndex =
    fields.indexOf(
      currentElement
    );

  if (
    currentIndex <= 0
  ) {
    return;
  }

  focusFormField(
    fields[
      currentIndex - 1
    ]
  );
}


function isEmptyInputAtStart(element) {

  if (
    element.tagName !== "INPUT" ||
    element.type === "file"
  ) {
    return false;
  }

  const value =
    String(
      element.value || ""
    );

  if (value.length > 0) {
    return false;
  }

  if (
    typeof element.selectionStart === "number"
  ) {

    return element.selectionStart === 0;
  }

  return true;
}


document.querySelector(
  ".form-card"
)
.addEventListener(
  "keydown",
  event => {

    if (event.isComposing) {
      return;
    }

    const target =
      event.target;

    if (
      !target.matches(
        "input:not([type='file']), select"
      )
    ) {
      return;
    }

    if (
      event.key === "Enter" ||
      event.key === "ArrowDown"
    ) {

      event.preventDefault();

      focusNextFormField(
        target
      );

      return;
    }

    if (
      event.key === "ArrowUp"
    ) {

      event.preventDefault();

      focusPreviousFormField(
        target
      );

      return;
    }

    if (
      (
        event.key === "Backspace" ||
        event.key === "Delete"
      ) &&
      isEmptyInputAtStart(
        target
      )
    ) {

      event.preventDefault();

      focusPreviousFormField(
        target
      );
    }
  }
);


/* =====================================================
   START
===================================================== */

checkLogin();


window.addEventListener(
  "resize",
  drawChart
);


window.editProduct =
  editProduct;


window.deleteProduct =
  deleteProduct;
