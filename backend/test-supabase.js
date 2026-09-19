const supabase = require("./supabase");

async function testInsert() {
  const { data, error } = await supabase
    .from("tracked_products")
    .insert([
      {
        product_id: "632",
        product_name: "Test Product",
        product_url: "https://demo.inelabteamdev.com/product/632",
        is_active: true,
      },
    ])
    .select();

  if (error) {
    console.log("❌ Insert failed:");
    console.log(error.message);
    return;
  }

  console.log("✅ Product inserted successfully!");
  console.log(data);
}

testInsert();