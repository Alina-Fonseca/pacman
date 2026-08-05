
const SUPABASE_URL = "https://toxzwrdglheqqdeytrxt.supabase.co";
const SUPABASE_KEY = "sb_publishable_VBK_CeUIW2ooKRAvr6cbKQ_Y7-VMk3K";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Leaderboard = {
  async submitScore(name, score) {
    const { error } = await supabaseClient.from("scores").insert({ name, score });
    if (error) {
      console.error("Error al guardar puntaje:", error);
      return false;
    }
    return true;
  },

  async getTopScores(limit = 10) {
    const { data, error } = await supabaseClient
      .from("scores")
      .select("name, score")
      .order("score", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("Error al cargar ranking:", error);
      return null;
    }
    return data;
  },
};
