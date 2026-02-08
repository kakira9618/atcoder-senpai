/* service_worker.js (MV3, module)
   Stores data in IndexedDB and exports JSONL.
*/
const DB_NAME = "atcoder_session_scout";
const DB_VERSION = 4;
const DEFAULT_PROMPT_PATH = "prompts/default_prompt.txt";
const DEFAULT_PROMPT_AHC_PATH = "prompts/default_prompt_ahc.txt";
let defaultPromptTemplates = null;
let defaultPromptTemplatesPromise = null;

async function fetchExtensionText(path) {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return await res.text();
}

async function loadDefaultPromptTemplates() {
  if (defaultPromptTemplatesPromise) return defaultPromptTemplatesPromise;
  defaultPromptTemplatesPromise = (async () => {
    try {
      const [normalPrompt, ahcPrompt] = await Promise.all([
        fetchExtensionText(DEFAULT_PROMPT_PATH),
        fetchExtensionText(DEFAULT_PROMPT_AHC_PATH)
      ]);
      defaultPromptTemplates = { normal: normalPrompt, ahc: ahcPrompt };
    } catch (e) {
      console.warn("Failed to load default prompts:", e);
      defaultPromptTemplates = { normal: "", ahc: "" };
    }
    return defaultPromptTemplates;
  })();
  return defaultPromptTemplatesPromise;
}

const DEFAULT_EXPECTED_EXAMPLE = [
  '# ABC219 分析レポート',
  '',
  'AtCoder ABC218におけるあなたの提出と、比較対象ユーザー（contestant_A, contestant_B, contestant_C）の提出データを比較・解析しました。',
  '全体として、A, B, D, GをACし、C, Eで少し苦戦（または後回し）、Fを飛ばしてGを解くというムーブをされています。特にG問題（600点）をPolicy-Based Data Structureを用いて殴り倒している点は非常に強力な武器をお持ちですが、E問題でのペナルティやF問題の未回答が順位に響いている可能性があります。',
  '',
  '以下に詳細な分析とアドバイスを記述します。',
  '',
  '---',
  '',
  '## 概要',
  '',
  '- **コンテスト**: ABC218',
  '- **対象ユーザー**: target_user',
  '- **比較対象ユーザー**: contestant_A (1位), contestant_B (2位), contestant_C (3位)',
  '- **コンテスト時間**: 2021-09-18 21:00:00 〜 22:40:00 (100分)',
  '',
  '## 提出タイムラインとパフォーマンス分析',
  '',
  '| 問題 | あなたのタイム (経過時間) | 上位平均タイム (目安) | 差分・状態 |',
  '| :--- | :--- | :--- | :--- |',
  '| **A** | 00:56 | 00:50 | **Excellent** (上位勢と遜色なし) |',
  '| **B** | 02:08 | 01:30 | **Excellent** (上位勢と遜色なし) |',
  '| **D** | 09:27 | 06:00 - 26:00 | **Good** (contestant_Bより速く、標準的な上位ペース) |',
  '| **E** | 32:32 (3 WA) | 01:30 - 09:30 | **Slow / Struggle** (3回のWAが痛手。実装方針に迷いあり) |',
  '| **C** | 40:42 | 04:40 - 32:00 | **Good** (Eの後回しにした判断は悪くないが、実装時間は少しかかっている) |',
  '| **F** | 未提出 | 19:00 - 20:00 | **Missed** (上位勢は確実に通している典型問題) |',
  '| **G** | 01:26:42 | 13:00 - 53:00 | **Great** (難易度が高いGを通せているのは素晴らしい) |',
  '| **H** | CE (考察のみ) | - | 時間切れ |',
  '',
  '### 全体的な考察',
  '*   **序盤 (A, B, D):** 非常にスムーズです。特にD問題まで10分以内で到達しているのは上位勢のペースです。',
  '*   **中盤 (E, C):** E問題で「負のコスト」と「連結性」の扱いにバグを埋め込み、約20分のロスとペナルティが発生しています。C問題は幾何・実装重めですが、Eの後に冷静に通しています。',
  '*   **終盤 (F, G):** F（最短経路の典型）を飛ばしてG（木上のゲーム）に行きました。結果的にGを通せたので大崩れはしていませんが、**Fは上位勢全員が解いている典型問題**であり、これを落とすのは非常にもったいないです。あなたの実力ならFは10-15分で解けたはずです。',
  '',
  '---',
  '',
  '# 問題別 詳細分析とアドバイス',
  '',
  '## A - Weather Forecast / B - qwerty',
  '*   **分析:** あなたのコードはC++の標準的な実装で、上位勢と比較しても遜色ありません。',
  '*   **アドバイス:** 特に改善点はありません。このスピードを維持してください。',
  '',
  '## C - Shapes',
  '*   **あなたの方針:**',
  '    *   `#` の相対座標の集合（左上の`#`を基準 `(0,0)` とする）を作成し、回転させて一致するか判定。',
  '    *   実装: `retSig` 関数で相対座標の `vector<pii>` を生成し、`==` 演算子で比較。',
  '*   **上位勢の方針:**',
  '    *   **contestant_A:** `#` の個数をカウントして早期リターン（定数倍高速化）。左上の`#`を見つけ、平行移動量を計算し、全点が一致するか確認。',
  '    *   **contestant_B:** 独自の配列操作ライブラリを使用しているが、本質は回転と相対位置比較。',
  '    *   **contestant_C:** `#` の座標リストを持ち、`A[i] - B[i]` の差分が全て一定かチェック。',
  '*   **比較・アドバイス:**',
  '    *   あなたの方針（正規化して比較）は非常にバグらせにくく、良い方針です。',
  '    *   **改善点:** `retSig` 内で毎回 `vector` を生成していますが、グリッドサイズ $N=200$ なので計算量は問題ありません。強いて言えば、最初に `#` の総数が一致しない場合に `No` を出すチェックを入れると、無駄な回転処理を省けます（contestant_A氏のアプローチ）。',
  '',
  '## D - Rectangles',
  '*   **あなたの方針:**',
  '    *   点を `set<pii>` に入れ、2点のペア全探索 $O(N^2)$。対角線が存在するか `set.count` で確認。',
  '*   **上位勢の方針:**',
  '    *   **contestant_A:** あなたと全く同じ（`set` 使用）。',
  '    *   **contestant_B:** `map<int, vector<int>>` で x座標ごとにy座標リストを持ち、y座標のペアをカウントする方針。',
  '*   **比較・アドバイス:**',
  '    *   $N \\le 2000$ なので $O(N^2 \\log N)$ は許容範囲です。',
  '    *   `set` は定数倍が重いため、Pythonなど遅い言語や、TLが厳しいC++問題では `unordered_set` (ただしハッシュ衝突注意) や、`vector` をソートして `binary_search` を使う方が安全です。今回は2秒制限なので `set` で正解です。',
  '',
  '## E - Destruction',
  '*   **あなたの方針 (最終ACコード):**',
  '    *   クラスカル法の変形。コストでソート。',
  '    *   `if ((E[i].c < 0) || !uf.findSet(E[i].a, E[i].b))` の場合、辺を採用（コストを加算）。',
  '    *   出力は `sum - cost`。',
  '*   **WAの原因:**',
  '    *   WAコードでは「負のコストの辺」の扱いや、「既に連結成分内にあるがコストが正の辺」をどう取り除くかのロジックが整理されていませんでした。',
  '*   **上位勢の方針 (contestant_A, contestant_B):**',
  '    *   **「取り除く辺」** に注目しています。',
  '    *   UnionFindで `u, v` が既に連結なら、その辺は「取り除ける候補」です。',
  '    *   もしその辺のコスト $C_i > 0$ なら、取り除いて報酬を得ます。$C_i < 0$ なら、取り除くと罰金なので（連結性に関係なく）取り除きません（残します）。',
  '    *   コード例: `if (!uf.unite(u, v)) { if(w > 0) ans += w; }`',
  '*   **アドバイス:**',
  '    *   **思考の転換:** 「残す辺のコストを最小化する」と考えると、負の数の扱いで混乱しがちです。「**不要な辺（閉路を作る辺）のうち、正のコストのものは全て売却して利益にする**」と考えると、実装がシンプルになります。',
  '    *   負の辺は「通るとお金がもらえる」ではなく「捨てると罰金」なので、MSTの構築においては「必ず採用する（コスト0とみなして先にuniteしておく）」あるいは「クラスカル法のソート順で自然に採用される」ようにすればOKです。',
  '',
  '## F - Blocked Roads (未提出)',
  '*   **問題概要:** 辺を1つ除いたときの最短経路を $M$ 通り求める。',
  '*   **上位勢の方針:**',
  '    *   まず、全ての辺がある状態でBFSを行い、最短経路を復元する。',
  '    *   **重要:** 削除する辺が「最短経路に含まれない」場合、最短距離は変わらない（計算不要）。',
  '    *   削除する辺が「最短経路に含まれる」場合のみ、再度BFSを行う。',
  '    *   最短経路の長さは最大 $N$ なので、BFSを行う回数は最大 $N$ 回。計算量は $O(N(N+M))$ となり、余裕で間に合う。',
  '*   **アドバイス:**',
  '    *   この問題は典型的な「クリティカルな辺のみ再計算」パターンです。',
  '    *   $N \\le 400$ という制約を見た瞬間、「$O(N^3)$ や $O(N \\cdot M)$ が通る」と判断し、この方針を想起すべきでした。G問題（データ構造ゲー）に行く前に、この典型考察を入れるだけで順位が大きく上がったはずです。',
  '',
  '## G - Game on Tree 2',
  '*   **あなたの方針:**',
  '    *   `pb_ds` (Policy-Based Data Structure) の `tree` を使い、DFSで行きがけに `insert`、帰りがけに `erase`。',
  '    *   現在パス上の集合の中央値を $O(\\log N)$ で取得。',
  '    *   Minimax法でゲームの勝敗値を計算。',
  '*   **上位勢の方針:**',
  '    *   **contestant_A:** **答えで二分探索**。',
  '        *   中央値が $X$ 以上になるか？という判定問題にする。',
  '        *   各頂点の値を $A_i \\ge X$ なら $1$、そうでなければ $-1$ とし、パス上の和などを考える単純なゲーム木探索にする。',
  '    *   **contestant_B:** `multiset` を2つ (`min_heap` 的なものと `max_heap` 的なもの) 用いて、中央値を動的に管理。`pb_ds` と似ているが、標準ライブラリの組み合わせで定数倍が良い可能性がある。',
  '*   **比較・アドバイス:**',
  '    *   あなたの `pb_ds` 解法は非常に賢く、実装力があります。C++ (GCC) 特有の機能ですが、AtCoderでは有効です。',
  '    *   **別解の習得:** 「中央値の最大化」→「答えで二分探索」は超典型テクニックです。`pb_ds` が使えない環境や、より複雑な条件（平均値など）の場合に備え、contestant_A氏のような二分探索アプローチも頭に入れておくと良いです。',
  '',
  '## H - Red and Blue Lamps (CE/考察のみ)',
  '*   **あなた:** マトロイド交差？とメモ。',
  '*   **上位勢の方針:**',
  '    *   **contestant_A:** **Alien\'s DP (WQS二分探索)**。',
  '        *   「ちょうど $R$ 個選ぶ」という制約をラグランジュ未定乗数法のように「$R$ 個選ぶ制約を外し、1個選ぶたびにコスト $P$ かかる」として最適化問題を解き、最適な個数が $R$ になるような $P$ を二分探索する。',
  '    *   **contestant_B:** 貪欲法 + 優先度付きキュー。',
  '        *   隣り合う要素をマージしていくような貪欲法（詳細な証明は難しいが、この手の問題でたまに出る）。',
  '*   **アドバイス:**',
  '    *   「ちょうど $K$ 個選ぶ」系の最大化問題で、凸性がある場合は **Alien\'s DP** が典型です。マトロイド交差も近い概念ですが、実装コストが高すぎます。このレベルの問題を解くには、WQS二分探索の知識が必要です。',
  '',
  '---',
  '',
  '# 総合アドバイス',
  '',
  '1.  **典型パターンの穴を埋める (F問題)**',
  '    *   G問題のような高度なデータ構造を使いこなせる一方で、F問題のような「制約から計算量を見積もって、再計算をサボる」タイプの典型グラフ問題を落としています。',
  '    *   **Action:** $N \\le 400 \\sim 500$ のグラフ問題を見たら、ワーシャルフロイドや「最短経路木の辺だけ特別扱い」を即座に疑ってください。',
  '',
  '2.  **「削除・無効化」系のコスト計算 (E問題)**',
  '    *   E問題で苦戦した原因は、コスト計算の視点が「残すもの」に向いていたため、負のコストの扱いに混乱が生じたことです。',
  '    *   **Action:** 「最大化したい」問題では、「基本全部取る。取れない（制約違反）場合や、取ると損する場合だけ捨てる」あるいはその逆の視点を持つと、条件分岐が減ります。',
  '',
  '3.  **データ構造偏重からの脱却 (G問題)**',
  '    *   `pb_ds` で殴れるのは強みですが、G問題の想定解法の一つである「答えで二分探索」の方が、応用が効く場面が多いです。',
  '    *   **Action:** 「中央値」「平均値」「$K$番目の値」を最大化・最小化する問題が出たら、まずは「答えを決め打ちして二分探索（判定問題化）」を検討する癖をつけると、より汎用的な力がつきます。',
  '',
  'あなたの実装力（特にテンプレート活用や高度なデータ構造）は非常に高いレベルにあります。あとは「典型的な考察パターン」の引き出しを増やし、立ち回りを最適化すれば、さらに上のパフォーマンスが出せるはずです。'
].join('\n');
const DEFAULT_EXPECTED_EXAMPLE_AHC = [
  '# AHC003 分析レポート',
  '',
  'AtCoder Heuristic Contest 003における$target_userの提出と、比較対象ユーザーの提出データを比較・解析しました。',
  'このコンテストは「ナップサック問題の変形」で、限られた計算時間内でできるだけ高いスコアを目指す問題でした。',
  '',
  '## 概要',
  '',
  '- **コンテスト**: AHC003',
  '- **対象ユーザー**: target_user',
  '- **比較対象ユーザー**: contestant_A (1位), contestant_B (2位), contestant_C (3位)',
  '- **最終スコア**: あなた: 1,234,567点 / 上位平均: 2,500,000点',
  '',
  '## スコア推移分析',
  '',
  '| 提出番号 | 提出時刻 | スコア | 前回からの変化 | アプローチ |',
  '| :--- | :--- | ---: | ---: | :--- |',
  '| #1 | 21:05 | 500,000 | - | 貪欲法（初期実装） |',
  '| #2 | 21:32 | 750,000 | +250,000 | 評価関数の改善 |',
  '| #3 | 22:15 | 950,000 | +200,000 | 焼きなまし法の導入 |',
  '| #4 | 22:58 | 1,100,000 | +150,000 | パラメータ調整 |',
  '| #5 | 23:30 | 1,234,567 | +134,567 | 温度スケジュールの最適化 |',
  '',
  '### 全体的な考察',
  '',
  '*   **初期実装:** 貪欲法で50万点を獲得。これは堅実なスタートです。',
  '*   **改善プロセス:** 焼きなまし法を導入してスコアが大きく向上しています。段階的な改善が見られます。',
  '*   **比較対象との差:** 最終的に約2倍のスコア差があります。アルゴリズムの選択とパラメータチューニングに改善の余地があります。',
  '',
  '---',
  '',
  '# 詳細分析',
  '',
  '## 1. 使用したアルゴリズム・手法',
  '',
  '### あなたのアプローチ',
  '',
  '最終提出（[#1234567](https://atcoder.jp/contests/ahc003/submissions/1234567)）では以下の手法を使用：',
  '',
  '```cpp',
  '// 焼きなまし法の実装',
  'double temp = START_TEMP;',
  'for (int iter = 0; iter < MAX_ITER; iter++) {',
  '    // 近傍解の生成',
  '    int idx = rand() % n;',
  '    swap(solution[idx], solution[idx+1]);',
  '    ',
  '    double delta = calcScore(newSolution) - calcScore(currentSolution);',
  '    if (delta > 0 || exp(delta / temp) > randDouble()) {',
  '        currentSolution = newSolution;',
  '    }',
  '    temp *= COOLING_RATE;',
  '}',
  '```',
  '',
  '*   **手法:** シンプルな焼きなまし法',
  '*   **近傍操作:** 隣接要素のswap',
  '*   **温度スケジュール:** 指数的減衰（`COOLING_RATE = 0.99`）',
  '',
  '### 比較対象ユーザーのアプローチ',
  '',
  '#### contestant_A (1位, 3,200,000点)',
  '',
  '```cpp',
  '// ビームサーチ + 焼きなまし法のハイブリッド',
  '// まずビームサーチで良い初期解を見つける',
  'vector<State> beam = beamSearch(BEAM_WIDTH, BEAM_DEPTH);',
  '',
  '// 各ビームの解に対して焼きなまし法を適用',
  'for (auto& state : beam) {',
  '    state = simulatedAnnealing(state, remainingTime / beam.size());',
  '}',
  '```',
  '',
  '*   **手法:** ビームサーチと焼きなまし法のハイブリッド',
  '*   **特徴:** 初期解の質が高く、そこから焼きなましで最適化',
  '*   **計算時間配分:** ビームサーチ30%、焼きなまし70%',
  '',
  '#### contestant_B (2位, 2,800,000点)',
  '',
  '*   **手法:** 多様な近傍操作を持つ焼きなまし法',
  '*   **近傍操作:** swap, insert, reverse, 2-opt など複数の操作を確率的に選択',
  '*   **評価関数:** スコアだけでなく「改善の見込み」も考慮',
  '',
  '## 2. 改善提案',
  '',
  '### 提案1: 初期解の改善',
  '',
  '**現状の問題:**',
  'あなたの初期解は完全ランダムですが、比較対象ユーザーは貪欲法やビームサーチで良い初期解を構築しています。',
  '',
  '**改善案:**',
  '```cpp',
  '// 貪欲法で初期解を構築',
  'vector<int> greedyInit() {',
  '    vector<int> result;',
  '    // 価値/重量比でソートして貪欲に選択',
  '    vector<pair<double, int>> items;',
  '    for (int i = 0; i < n; i++) {',
  '        items.push_back({(double)value[i] / weight[i], i});',
  '    }',
  '    sort(items.rbegin(), items.rend());',
  '    // ...',
  '}',
  '```',
  '',
  '**期待効果:** 初期スコアが+30-50%向上し、焼きなましの開始点が改善されます。',
  '',
  '### 提案2: 近傍操作の多様化',
  '',
  '**現状の問題:**',
  '隣接要素のswapのみでは探索空間が狭く、局所最適解に陥りやすいです。',
  '',
  '**改善案:**',
  '```cpp',
  '// 複数の近傍操作',
  'void perturbSolution(vector<int>& sol) {',
  '    int op = rand() % 3;',
  '    if (op == 0) {  // swap',
  '        int i = rand() % n, j = rand() % n;',
  '        swap(sol[i], sol[j]);',
  '    } else if (op == 1) {  // insert',
  '        int i = rand() % n, j = rand() % n;',
  '        int val = sol[i];',
  '        sol.erase(sol.begin() + i);',
  '        sol.insert(sol.begin() + j, val);',
  '    } else {  // reverse',
  '        int i = rand() % n, j = rand() % n;',
  '        if (i > j) swap(i, j);',
  '        reverse(sol.begin() + i, sol.begin() + j);',
  '    }',
  '}',
  '```',
  '',
  '**期待効果:** より広い探索空間をカバーし、スコアが+20-30%向上する見込みです。',
  '',
  '### 提案3: 温度スケジュールの最適化',
  '',
  '**現状の問題:**',
  '固定の冷却率（0.99）では、問題の特性に合わない可能性があります。',
  '',
  '**改善案:**',
  '```cpp',
  '// 時間ベースの温度スケジュール',
  'double getTemp(double elapsedTime, double totalTime) {',
  '    double progress = elapsedTime / totalTime;',
  '    return START_TEMP * pow(END_TEMP / START_TEMP, progress);',
  '}',
  '```',
  '',
  '**期待効果:** 計算時間を最大限活用でき、安定して高スコアが出せます。',
  '',
  '## 3. パラメータチューニングの指針',
  '',
  '比較対象ユーザーのコードから推測される良いパラメータ設定：',
  '',
  '- **開始温度:** `START_TEMP = 100.0`（現在の10倍程度に設定）',
  '- **終了温度:** `END_TEMP = 0.01`',
  '- **反復回数:** 時間制限ギリギリまで実行（固定回数ではなく時間で制御）',
  '',
  '## まとめ',
  '',
  'あなたの実装は基本的な焼きなまし法をしっかり実装できており、段階的な改善も見られます。',
  'さらに上位を目指すためには：',
  '',
  '1. 初期解の質を上げる（貪欲法、ビームサーチ）',
  '2. 近傍操作を多様化する',
  '3. パラメータを問題に合わせて調整する',
  '4. 計算時間を最大限活用する',
  '',
  'これらの改善により、スコアが2倍以上になる可能性があります。'
].join('\n');
let aiRunCtx = null;
const textEncoder = new TextEncoder();

function normalizeSelfUser(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function isAhcContest(contest) {
  if (!contest) return false;
  return contest.toLowerCase().startsWith('ahc');
}

function strToUint8(str) {
  return textEncoder.encode(str);
}

let crcTable = null;
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(uint8) {
  if (!crcTable) crcTable = makeCrcTable();
  let crc = 0 ^ -1;
  for (let i = 0; i < uint8.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ uint8[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const year = date.getFullYear();
  const dosYear = Math.max(0, year < 1980 ? 0 : year - 1980);
  const dosMonth = date.getMonth() + 1;
  const dosDay = date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = (dosYear << 9) | (dosMonth << 5) | dosDay;
  return { time: dosTime & 0xffff, date: dosDate & 0xffff };
}

function makeZip(files) {
  // files: [{ name, data (string|Uint8Array), date? }]
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = strToUint8(f.name);
    const data = f.data instanceof Uint8Array ? f.data : strToUint8(f.data || "");
    const crc = crc32(data);
    const mod = toDosDateTime(f.date ? new Date(f.date) : new Date());
    const localHeader = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true);  // flags
    lv.setUint16(8, 0, true);  // compression: store
    lv.setUint16(10, mod.time, true);
    lv.setUint16(12, mod.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra len
    localHeader.set(nameBytes, 30);
    localHeader.set(data, 30 + nameBytes.length);
    localParts.push(localHeader);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);  // flags
    cv.setUint16(10, 0, true); // compression
    cv.setUint16(12, mod.time, true);
    cv.setUint16(14, mod.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra len
    cv.setUint16(32, 0, true); // comment len
    cv.setUint16(34, 0, true); // disk start
    cv.setUint16(36, 0, true); // internal attr
    cv.setUint32(38, 0, true); // external attr
    cv.setUint32(42, offset, true); // relative offset
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true); // disk numbers
  ev.setUint16(6, 0, true);
  ev.setUint16(8, localParts.length, true);
  ev.setUint16(10, localParts.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // comment length

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function uint8ToBase64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

async function blobToObjectUrl(blob) {
  const urlCtor = (typeof self !== "undefined" && self.URL)
    || (typeof URL !== "undefined" ? URL : null)
    || (typeof globalThis !== "undefined" ? globalThis.URL : null);
  if (urlCtor && typeof urlCtor.createObjectURL === "function") {
    return urlCtor.createObjectURL(blob);
  }
  // Fallback: data URL (slower, but avoids createObjectURL absence)
  const buf = await blob.arrayBuffer();
  const b64 = uint8ToBase64(new Uint8Array(buf));
  return `data:application/zip;base64,${b64}`;
}

function canonicalUser(value) {
  const n = normalizeSelfUser(value);
  return n ? n.toLowerCase() : null;
}

function cacheKeyFor(contest, selfUser, topUsers = []) {
  const ukey = canonicalUser(selfUser) || "__self__";
  if (!topUsers || topUsers.length === 0) return `${contest}::${ukey}`;
  const topKey = [...topUsers].map(u => canonicalUser(u)).sort().join(",");
  return `${contest}::${ukey}::${topKey}`;
}

function metaKeyForContestWindow(contest) {
  return `contest_window::${contest}`;
}

function metaKeyForTopUserChecked(contest, user) {
  const userKey = canonicalUser(user);
  return userKey ? `top_user_checked::${contest}::${userKey}` : null;
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Number(value)));
}

function startAiRun(contest) {
  if (aiRunCtx?.controller) aiRunCtx.controller.abort();
  const controller = new AbortController();
  aiRunCtx = { contest, controller, cancelled: false };
  return aiRunCtx;
}

function cancelAiRun(contest) {
  if (!aiRunCtx) return false;
  if (contest && aiRunCtx.contest && aiRunCtx.contest !== contest) return false;
  aiRunCtx.cancelled = true;
  if (aiRunCtx.controller) aiRunCtx.controller.abort();
  return true;
}

function aiSignal() {
  return aiRunCtx?.controller?.signal || null;
}

function isAiCancelledError(e) {
  return e?.name === "AbortError" || e?.name === "AiRunCancelled";
}

function throwIfAiCancelled() {
  const sig = aiSignal();
  if (aiRunCtx?.cancelled || (sig && sig.aborted)) {
    const err = new Error("AI_RUN_CANCELLED");
    err.name = "AiRunCancelled";
    throw err;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("submissions")) {
        const st = db.createObjectStore("submissions", { keyPath: "key" });
        st.createIndex("contest", "contest", { unique: false });
        st.createIndex("user", "user", { unique: false });
      }
      if (!db.objectStoreNames.contains("users")) {
        const st = db.createObjectStore("users", { keyPath: "key" });
        st.createIndex("contest", "contest", { unique: false });
      }
      if (!db.objectStoreNames.contains("tasks")) {
        const st = db.createObjectStore("tasks", { keyPath: "key" });
        st.createIndex("contest", "contest", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (db.objectStoreNames.contains("exports")) {
        db.deleteObjectStore("exports"); // drop legacy (contest-only) cache
      }
      const exportsStore = db.createObjectStore("exports", { keyPath: "cacheKey" });
      exportsStore.createIndex("contest", "contest", { unique: false });
      exportsStore.createIndex("selfUserKey", "selfUserKey", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map(n => [n, t.objectStore(n)]));
    let result;
    Promise.resolve()
      .then(() => fn(stores))
      .then(r => { result = r; })
      .catch(err => { reject(err); });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("transaction aborted"));
  });
}

function nowIso() { return new Date().toISOString(); }

function sizeOfString(str) {
  return new TextEncoder().encode(str).length; // bytes
}

function sanitizeReviewIdPart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildLegacyReviewId(savedAt, index) {
  const base = sanitizeReviewIdPart(savedAt || "unknown");
  return `legacy-${base}-${index}`;
}

function createReviewId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `review-${ts}-${rand}`;
}

function reviewTimestamp(review) {
  const t = Date.parse(review?.savedAt || "");
  return Number.isNaN(t) ? 0 : t;
}

function reviewLooksSame(a, b) {
  if (!a || !b) return false;
  if (a.markdown && b.markdown && a.markdown === b.markdown) {
    if (a.aiProvider || a.aiModel || b.aiProvider || b.aiModel) {
      return (a.aiProvider || null) === (b.aiProvider || null)
        && (a.aiModel || null) === (b.aiModel || null);
    }
    return true;
  }
  if (a.savedAt && b.savedAt && a.savedAt === b.savedAt) return true;
  return false;
}

function normalizeReviewsFromRecord(rec) {
  const reviews = Array.isArray(rec?.reviews) ? rec.reviews.map(r => ({ ...r })) : [];
  const hasTopLevel = rec && (rec.markdown || rec.html || rec.prompt || rec.aiProvider || rec.aiModel);
  if (hasTopLevel) {
    const legacy = {
      id: rec.reviewId || null,
      markdown: rec.markdown || null,
      prompt: rec.prompt || null,
      html: rec.html || null,
      aiProvider: rec.aiProvider || null,
      aiModel: rec.aiModel || null,
      savedAt: rec.reviewSavedAt || rec.savedAt || null
    };
    if (!reviews.some(r => reviewLooksSame(r, legacy))) {
      reviews.push(legacy);
    }
  }
  const fallbackSavedAt = rec?.reviewSavedAt || rec?.savedAt || nowIso();
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    if (!r.savedAt) r.savedAt = fallbackSavedAt;
    if (!r.id) r.id = buildLegacyReviewId(r.savedAt, i);
  }
  return reviews;
}

function latestReview(reviews) {
  if (!reviews || reviews.length === 0) return null;
  let latest = reviews[0];
  for (const r of reviews) {
    if (reviewTimestamp(r) >= reviewTimestamp(latest)) {
      latest = r;
    }
  }
  return latest;
}

function selectReviewFromRecord(rec, reviewId = null) {
  const reviews = normalizeReviewsFromRecord(rec);
  if (reviewId) {
    const found = reviews.find(r => r.id === reviewId);
    if (found) return { review: found, reviews };
  }
  return { review: latestReview(reviews), reviews };
}

async function saveExportPayload(payload, limit = 100) {
  if (!payload || !payload.contest) throw new Error("Invalid export payload");
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const contest = parsed.contest;
  const selfUser = normalizeSelfUser(parsed.selfUser);
  const hasLoginKey = Array.isArray(parsed.mySubmissions)
    && parsed.mySubmissions.some((s) => s && s.selfUserKey === "__self__");
  const selfUserKey = hasLoginKey ? "__self__" : (canonicalUser(selfUser) || "__self__");
  const topUserNames = (parsed.topUsers || []).map(u => u.user).filter(Boolean);
  const cacheKey = cacheKeyFor(contest, selfUserKey === "__self__" ? null : selfUser, topUserNames);
  const savedAt = nowIso();
  const size = sizeOfString(json);
  let existing = null;
  try { existing = await getExportPayloadByKey(cacheKey); } catch {}
  // デバッグ: キャッシュに含まれるデータを確認
  const tasksCount = parsed.tasks?.length || 0;
  const mySubsCount = parsed.mySubmissions?.length || 0;
  const topSubsCount = parsed.topUsersSubmissions?.length || 0;
  console.log(`Caching payload for ${contest}: ${tasksCount} tasks, ${mySubsCount} my submissions, ${topSubsCount} top submissions`);

  await tx(["exports"], "readwrite", async ({ exports: st }) => {
    const reviews = normalizeReviewsFromRecord(existing);
    const latest = latestReview(reviews);
    await reqToPromise(st.put({
      cacheKey,
      contest,
      selfUser: selfUser || null,
      selfUserKey,
      json,
      savedAt,
      size,
      tasksCount,
      mySubmissionsCount: mySubsCount,
      topSubmissionsCount: topSubsCount,
      topUserNames,
      markdown: latest?.markdown || existing?.markdown || null,
      prompt: latest?.prompt || existing?.prompt || null,
      html: latest?.html || existing?.html || null,
      reviewSavedAt: latest?.savedAt || existing?.reviewSavedAt || null,
      aiProvider: latest?.aiProvider || existing?.aiProvider || null,
      aiModel: latest?.aiModel || existing?.aiModel || null,
      reviews
    }));
  });
  await pruneExports(limit);
  return { contest, selfUser: selfUser || null, savedAt, size, tasksCount, cacheKey };
}

async function pruneExports(limit = 100) {
  const items = await listExportsFull();
  if (items.length <= limit) return;
  const sorted = items.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
  const toDelete = sorted.slice(0, items.length - limit);
  if (toDelete.length === 0) return;
  await tx(["exports"], "readwrite", async ({ exports: st }) => {
    await Promise.all(toDelete.map(it => reqToPromise(st.delete(it.cacheKey))));
  });
}

async function listExportsMeta() {
  return await tx(["exports"], "readonly", async ({ exports: st }) => {
    const out = [];
    await new Promise((resolve, reject) => {
      const cur = st.openCursor();
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        const value = c.value;
        const {
          cacheKey,
          contest,
          selfUser = null,
          selfUserKey = null,
          savedAt,
          size,
          tasksCount,
          mySubmissionsCount,
          topSubmissionsCount,
          topUserNames = []
        } = value;
        const base = {
          cacheKey,
          contest,
          selfUser,
          selfUserKey,
          size,
          tasksCount,
          mySubmissionsCount,
          topSubmissionsCount,
          topUserNames,
          hasJson: Boolean(value.json),
          baseSavedAt: savedAt || null
        };
        const reviews = normalizeReviewsFromRecord(value);
        if (reviews.length) {
          for (let i = 0; i < reviews.length; i++) {
            const r = reviews[i];
            out.push({
              ...base,
              reviewId: r.id || buildLegacyReviewId(r.savedAt, i),
              savedAt: r.savedAt || savedAt || null,
              reviewSavedAt: r.savedAt || null,
              hasPrompt: Boolean(r.prompt),
              hasMarkdown: Boolean(r.markdown),
              hasHtml: Boolean(r.html || r.markdown),
              aiProvider: r.aiProvider || null,
              aiModel: r.aiModel || null
            });
          }
        } else {
          out.push({
            ...base,
            reviewId: null,
            savedAt: savedAt || null,
            reviewSavedAt: null,
            hasPrompt: Boolean(value.prompt),
            hasMarkdown: Boolean(value.markdown),
            hasHtml: Boolean(value.html || value.markdown),
            aiProvider: value.aiProvider || null,
            aiModel: value.aiModel || null
          });
        }
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return out;
  });
}

async function listExportsFull() {
  return await tx(["exports"], "readonly", async ({ exports: st }) => {
    const out = [];
    await new Promise((resolve, reject) => {
      const cur = st.openCursor();
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        out.push(c.value);
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return out;
  });
}

function safePathSegment(value, fallback = "item") {
  const raw = String(value || "").trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned || fallback;
}

function formatSavedAtForPath(iso) {
  if (!iso) return timestampForFilename();
  return String(iso).replace("T", "_").replace("Z", "").replace(/[:.]/g, "-");
}

async function getExportPayloadByKey(cacheKey) {
  return await tx(["exports"], "readonly", async ({ exports: st }) => {
    const rec = await reqToPromise(st.get(cacheKey));
    return rec || null;
  });
}

async function getExportPayload(contest, selfUser = null) {
  // まず旧形式キー（topUsersなし）で直接検索
  const legacyKey = cacheKeyFor(contest, selfUser);
  const direct = await getExportPayloadByKey(legacyKey);
  if (direct) return direct;
  // contestインデックスでスキャンし、selfUserが一致する最新レコードを返す
  const ukey = canonicalUser(selfUser) || "__self__";
  return await tx(["exports"], "readonly", async ({ exports: st }) => {
    const idx = st.index("contest");
    let best = null;
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(IDBKeyRange.only(contest));
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        const v = c.value;
        if ((v.selfUserKey || "__self__") === ukey) {
          if (!best || (v.savedAt && (!best.savedAt || v.savedAt > best.savedAt))) {
            best = v;
          }
        }
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return best;
  });
}

async function ensureExportRecord(contest, selfUser = null, explicitCacheKey = null) {
  const existing = explicitCacheKey
    ? await getExportPayloadByKey(explicitCacheKey)
    : await getExportPayload(contest, selfUser);
  if (existing) return existing;
  const { basePayload } = await buildPayloads(contest, selfUser);
  await saveExportPayload(basePayload);
  return await getExportPayload(contest, selfUser);
}

async function updateExportReview(contest, selfUser = null, review = {}, explicitCacheKey = null) {
  const rec = await ensureExportRecord(contest, selfUser, explicitCacheKey);
  if (!rec) return { ok: false, error: "キャッシュがありません" };
  const reviews = normalizeReviewsFromRecord(rec);
  let target = null;
  if (review.reviewId) {
    target = reviews.find(r => r.id === review.reviewId) || null;
  }
  const last = latestReview(reviews);
  if (!target) {
    if (review.markdown && last) {
      const sameMarkdown = Boolean(last.markdown && last.markdown === review.markdown);
      const providerProvided = review.aiProvider !== undefined || review.aiModel !== undefined;
      const sameProvider = providerProvided
        ? ((last.aiProvider || null) === (review.aiProvider || null)
          && (last.aiModel || null) === (review.aiModel || null))
        : true;
      if (sameMarkdown && sameProvider) {
        target = last;
      }
    } else if (!review.markdown && review.html && last && !last.html) {
      target = last;
    }
  }
  if (!target) {
    target = { id: review.reviewId || createReviewId(), savedAt: nowIso() };
    reviews.push(target);
  }
  if (!target.savedAt) target.savedAt = nowIso();
  if (review.markdown !== undefined) target.markdown = review.markdown;
  if (review.prompt !== undefined) target.prompt = review.prompt;
  if (review.html !== undefined) target.html = review.html;
  if (review.aiProvider !== undefined) target.aiProvider = review.aiProvider;
  if (review.aiModel !== undefined) target.aiModel = review.aiModel;
  const latest = latestReview(reviews);
  const next = {
    ...rec,
    reviews,
    markdown: latest?.markdown || null,
    prompt: latest?.prompt || null,
    html: latest?.html || null,
    aiProvider: latest?.aiProvider || null,
    aiModel: latest?.aiModel || null,
    reviewSavedAt: latest?.savedAt || rec.reviewSavedAt || nowIso()
  };
  await tx(["exports"], "readwrite", async ({ exports: st }) => {
    await reqToPromise(st.put(next));
  });
  return { ok: true, reviewId: target.id || null };
}

async function deleteExport(contest, selfUser = null, explicitCacheKey = null) {
  const cacheKey = explicitCacheKey || cacheKeyFor(contest, selfUser);
  await tx(["exports"], "readwrite", async ({ exports: st }) => {
    await reqToPromise(st.delete(cacheKey));
  });
  return { ok: true };
}

async function deleteExportReview(contest, selfUser = null, reviewId = null, reviewSavedAt = null, explicitCacheKey = null) {
  const rec = explicitCacheKey
    ? await getExportPayloadByKey(explicitCacheKey)
    : await getExportPayload(contest, selfUser);
  if (!rec) return { ok: false, error: "キャッシュがありません" };
  let reviews = normalizeReviewsFromRecord(rec);
  if (reviewId) {
    reviews = reviews.filter(r => r.id !== reviewId);
  } else if (reviewSavedAt) {
    reviews = reviews.filter(r => r.savedAt !== reviewSavedAt);
  } else {
    reviews = [];
  }
  const latest = latestReview(reviews);
  const next = {
    ...rec,
    reviews,
    markdown: latest?.markdown || null,
    prompt: latest?.prompt || null,
    html: latest?.html || null,
    aiProvider: latest?.aiProvider || null,
    aiModel: latest?.aiModel || null,
    reviewSavedAt: latest?.savedAt || null
  };
  await tx(["exports"], "readwrite", async ({ exports: st }) => {
    await reqToPromise(st.put(next));
  });
  return { ok: true };
}

async function setContestWindow(contest, window) {
  if (!contest || !window?.startAt || !window?.endAt) return { ok: false };
  const key = metaKeyForContestWindow(contest);
  const startAt = new Date(window.startAt);
  const endAt = new Date(window.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return { ok: false };
  const record = { key, contest, startAt: startAt.toISOString(), endAt: endAt.toISOString(), updatedAt: nowIso() };
  await tx(["meta"], "readwrite", async ({ meta }) => {
    await reqToPromise(meta.put(record));
  });
  return { ok: true, contest, startAt: record.startAt, endAt: record.endAt };
}

async function getContestWindow(contest) {
  if (!contest) return null;
  const key = metaKeyForContestWindow(contest);
  const rec = await tx(["meta"], "readonly", async ({ meta }) => await reqToPromise(meta.get(key)));
  if (!rec?.startAt || !rec?.endAt) return null;
  const start = new Date(rec.startAt);
  const end = new Date(rec.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

async function markTopUserChecked(contest, user) {
  const key = metaKeyForTopUserChecked(contest, user);
  if (!contest || !key) return { ok: false };
  const record = {
    key,
    contest,
    type: "top_user_checked",
    user: normalizeSelfUser(user),
    updatedAt: nowIso()
  };
  await tx(["meta"], "readwrite", async ({ meta }) => {
    await reqToPromise(meta.put(record));
  });
  return { ok: true };
}

async function hasTopUserChecked(contest, user) {
  const key = metaKeyForTopUserChecked(contest, user);
  if (!contest || !key) return false;
  const rec = await tx(["meta"], "readonly", async ({ meta }) => await reqToPromise(meta.get(key)));
  return Boolean(rec);
}

async function deleteMetaByPrefix(metaStore, prefix) {
  await new Promise((resolve, reject) => {
    const cur = metaStore.openCursor();
    cur.onsuccess = (e) => {
      const c = e.target.result;
      if (!c) return resolve();
      if (String(c.key || "").startsWith(prefix)) c.delete();
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

async function clearExports() {
  await tx(["exports"], "readwrite", async ({ exports: st }) => {
    await reqToPromise(st.clear());
  });
  return { ok: true };
}

async function upsertSubmissions(items) {
  return await tx(["submissions"], "readwrite", async ({ submissions }) => {
    let added = 0, updated = 0;
    for (const it of items) {
      const key = `${it.contest}::${it.submissionId}`;
      const existing = await reqToPromise(submissions.get(key));
      const sourceTag = it.sourceTag || it.source;
      const incomingSources = sourceTag ? [sourceTag] : [];
      const record = { ...it, key, updatedAt: nowIso() };
      if (record.selfUserKey === undefined && existing?.selfUserKey !== undefined) {
        record.selfUserKey = existing.selfUserKey;
      }
      delete record.sourceTag;
      if (!existing) {
        record.createdAt = nowIso();
        record.sources = incomingSources;
        submissions.add(record);
        added++;
      } else {
        record.createdAt = existing.createdAt || record.updatedAt;
        const prevSources = Array.isArray(existing.sources) ? existing.sources : [];
        record.sources = [...new Set(prevSources.concat(incomingSources))];
        submissions.put(record);
        updated++;
      }
    }
    return { added, updated };
  });
}

async function upsertUsers(contest, users) {
  return await tx(["users"], "readwrite", async ({ users: st }) => {
    for (const u of users) {
      const user = typeof u === "string" ? u : u.user;
      const rank = typeof u === "string" ? null : (u.rank ?? null);
      if (!user) continue;
      const key = `${contest}::${user}`;
      st.put({ key, contest, user, rank, updatedAt: nowIso() });
    }
    return { count: users.length };
  });
}

async function upsertTasks(contest, tasks) {
  return await tx(["tasks"], "readwrite", async ({ tasks: st }) => {
    let added = 0, updated = 0;
    for (const t of tasks) {
      const key = `${contest}::${t.taskId}`;
      const existing = await reqToPromise(st.get(key));
      const record = { ...t, key, contest, updatedAt: nowIso() };
      if (!existing) {
        record.createdAt = nowIso();
        st.add(record);
        added++;
      } else {
        record.createdAt = existing.createdAt || record.updatedAt;
        st.put(record);
        updated++;
      }
    }
    return { added, updated, count: tasks.length };
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function listUsers(contest, limit) {
  return await tx(["users"], "readonly", async ({ users }) => {
    const idx = users.index("contest");
    const range = IDBKeyRange.only(contest);
    const out = [];
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        out.push(c.value.user);
        if (limit && out.length >= limit) return resolve();
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return out;
  });
}

async function listUsersWithRank(contest) {
  return await tx(["users"], "readonly", async ({ users }) => {
    const idx = users.index("contest");
    const range = IDBKeyRange.only(contest);
    const out = [];
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        out.push({ user: c.value.user, rank: c.value.rank ?? null });
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return out;
  });
}

function parseSubmittedAtDate(submittedAt) {
  if (!submittedAt) return null;
  const iso = submittedAt.includes("T") ? submittedAt : submittedAt.replace(" ", "T");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWithinContestWindow(submittedAt, window) {
  if (!window?.startAt || !window?.endAt) return true;
  const d = parseSubmittedAtDate(submittedAt);
  if (!d) return false;
  const start = new Date(window.startAt);
  const end = new Date(window.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
  return d >= start && d <= end;
}

function filterSubmissionsByWindow(list, window) {
  if (!window?.startAt || !window?.endAt) return list.slice();
  return (list || []).filter(r => isWithinContestWindow(r.submittedAt, window));
}

async function getRowsByContest(storeName, contest) {
  return await tx([storeName], "readonly", async (stores) => {
    const st = stores[storeName];
    const idx = st.index("contest");
    const range = IDBKeyRange.only(contest);
    const out = [];
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        const { key, ...rest } = c.value;
        out.push(rest);
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return out;
  });
}

async function countByContest(storeName, contest) {
  if (!contest) return 0;
  return await tx([storeName], "readonly", async (stores) => {
    const st = stores[storeName];
    const idx = st.index("contest");
    const range = IDBKeyRange.only(contest);
    const count = await reqToPromise(idx.count(range));
    return Number(count) || 0;
  });
}

async function countSubmissionsByContest(contest, selfUser = null) {
  if (!contest) return { top: 0, my: 0 };
  const selfKey = selfUser === null ? "__self__" : canonicalUser(selfUser);
  return await tx(["submissions"], "readonly", async ({ submissions }) => {
    const idx = submissions.index("contest");
    const range = IDBKeyRange.only(contest);
    let top = 0;
    let my = 0;
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        const v = c.value || {};
        const sources = Array.isArray(v.sources) ? v.sources : [];
        if (sources.includes("top")) top += 1;
        if (sources.includes("me") && selfKey) {
          const recordKey = v.selfUserKey || canonicalUser(v.user);
          if (recordKey === selfKey) my += 1;
        }
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return { top, my };
  });
}

async function countUserSubmissions(contest, username) {
  if (!contest || !username) return 0;
  const userLower = username.toLowerCase();
  return await tx(["submissions"], "readonly", async ({ submissions }) => {
    const idx = submissions.index("contest");
    const range = IDBKeyRange.only(contest);
    let count = 0;
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        const v = c.value || {};
        if ((v.user || "").toLowerCase() === userLower) count++;
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return count;
  });
}

async function clearUsersByContest(contest) {
  if (!contest) return;
  return await tx(["users"], "readwrite", async ({ users }) => {
    const idx = users.index("contest");
    const range = IDBKeyRange.only(contest);
    const keys = [];
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve();
        keys.push(c.primaryKey);
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    for (const key of keys) {
      users.delete(key);
    }
  });
}

function pickSelfUser(records, preferredUser) {
  const prefNorm = canonicalUser(preferredUser);
  if (prefNorm) {
    const match = records.find(r => canonicalUser(r.user) === prefNorm);
    return match ? (match.user || preferredUser) : preferredUser;
  }
  const counts = new Map();
  const firstSeen = new Map();
  for (const r of records) {
    const norm = canonicalUser(r.user);
    if (!norm) continue;
    counts.set(norm, (counts.get(norm) || 0) + 1);
    if (!firstSeen.has(norm)) firstSeen.set(norm, r.user);
  }
  let best = null, bestCount = 0;
  for (const [norm, count] of counts.entries()) {
    if (count > bestCount) { best = norm; bestCount = count; }
  }
  if (best) return firstSeen.get(best) || preferredUser || null;
  return preferredUser || null;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureSelfSubmissions(payload) {
  const cnt = payload?.mySubmissions?.length || 0;
  if (cnt === 0) {
    const userLabel = payload?.selfUser || "対象ユーザー";
    throw new Error(`${userLabel} の提出データが1件も取得できていないため処理を中断しました（提出が0件の場合も含みます）。`);
  }
}

async function buildExportPayload(contest, options = {}) {
  const preferredSelfUser = normalizeSelfUser(options.selfUser);
  const contestWindow = await getContestWindow(contest);
  const submissions = await getRowsByContest("submissions", contest);
  const tasks = await getRowsByContest("tasks", contest);
  const topUsers = await listUsersWithRank(contest);
  const rankMap = new Map(topUsers.map(u => [u.user, u.rank]));
  const topUserSet = new Set(topUsers.map(u => u.user));

  const myCandidates = [];
  const topUsersSubmissions = [];
  for (const r of submissions) {
    const sources = Array.isArray(r.sources) ? r.sources : [];
    if (sources.includes("me")) myCandidates.push(r);
    if (sources.includes("top") && topUserSet.has(r.user)) {
      const rank = rankMap.get(r.user) ?? null;
      topUsersSubmissions.push(rank === null ? r : { ...r, rank });
    }
  }

  let myPool = myCandidates;
  const preferredKey = canonicalUser(preferredSelfUser);
  if (preferredKey) {
    const filtered = myCandidates.filter(r => {
      if (r.selfUserKey) return r.selfUserKey === preferredKey;
      return canonicalUser(r.user) === preferredKey;
    });
    if (filtered.length > 0) myPool = filtered;
  } else {
    const loginPool = myCandidates.filter(r => r.selfUserKey === "__self__");
    if (loginPool.length > 0) myPool = loginPool;
  }

  const resolvedSelfUser = pickSelfUser(myPool, preferredSelfUser);
  const selfUserKey = canonicalUser(resolvedSelfUser);
  const mySubmissions = selfUserKey
    ? myPool.filter(r => canonicalUser(r.user) === selfUserKey)
    : myPool;
  const selfUser = resolvedSelfUser || preferredSelfUser || null;

  console.log(`Building export payload for ${contest}: ${tasks.length} tasks, ${mySubmissions.length} my submissions, ${topUsersSubmissions.length} top submissions`);

  return {
    contest,
    contestWindow: contestWindow || null,
    selfUser,
    generatedAt: nowIso(),
    tasks,
    topUsers,
    mySubmissions,
    topUsersSubmissions
  };
}

async function buildPayloads(contest, selfUser = null, basePayloadOverride = null) {
  let basePayload = basePayloadOverride || await buildExportPayload(contest, { selfUser });
  if (basePayload.selfUser === undefined) {
    basePayload = { ...basePayload, selfUser: normalizeSelfUser(selfUser) };
  }
  const { windowPayload, contestWindow } = await deriveWindowPayload(basePayload, contest);
  if (contestWindow && !basePayload.contestWindow) {
    basePayload = { ...basePayload, contestWindow };
  }
  return { basePayload, windowPayload, contestWindow };
}

async function loadBasePayloadFromCacheOrDb(contest, selfUser, saveIfMissing = false) {
  let rec = null;
  try {
    rec = await getExportPayload(contest, selfUser);
  } catch (e) {
    console.warn("Failed to load cached export payload:", e);
  }
  if (rec?.json) {
    try {
      const payload = JSON.parse(rec.json);
      return { payload, fromCache: true };
    } catch (e) {
      console.warn("Failed to parse cached export payload, rebuilding from DB:", e);
    }
  }
  const { basePayload } = await buildPayloads(contest, selfUser);
  if (saveIfMissing) {
    try {
      await saveExportPayload(basePayload);
    } catch (e) {
      console.warn("Failed to save export payload:", e);
    }
  }
  return { payload: basePayload, fromCache: false };
}

async function loadExportExtras(contest, selfUser) {
  const out = { basePayload: null, markdown: null, prompt: null, html: null };
  try {
    const rec = await getExportPayload(contest, selfUser);
    if (rec?.json) {
      try {
        out.basePayload = JSON.parse(rec.json);
      } catch {
        out.basePayload = null;
      }
    }
    out.markdown = rec?.markdown || null;
    out.prompt = rec?.prompt || null;
    out.html = rec?.html || null;
  } catch {
    // ignore cache lookup failures
  }
  return out;
}

async function deriveWindowPayload(basePayload, contest) {
  const window = (basePayload && basePayload.contestWindow) || await getContestWindow(contest);
  if (!window?.startAt || !window?.endAt) {
    const clone = { ...basePayload, contestWindow: null };
    return { windowPayload: clone, contestWindow: null };
  }
  const filteredMy = filterSubmissionsByWindow(basePayload.mySubmissions || [], window);
  const filteredTop = filterSubmissionsByWindow(basePayload.topUsersSubmissions || [], window);
  const filtered = {
    ...basePayload,
    contestWindow: window,
    mySubmissions: filteredMy,
    topUsersSubmissions: filteredTop
  };
  return { windowPayload: filtered, contestWindow: window };
}

function rowsToNdjson(rows) {
  const lines = (rows || []).map(r => JSON.stringify(r));
  return lines.length ? (lines.join("\n") + "\n") : "";
}

async function prepareExportFiles(contest, selfUser, basePayload, windowPayload, markdownText = null, promptText = null, htmlText = null) {
  const userSuffix = selfUser || basePayload?.selfUser || null;
  const nameBase = userSuffix ? `atcoder-${contest}-${userSuffix}` : `atcoder-${contest}`;
  const files = [
    { name: `${nameBase}.json`, data: JSON.stringify(windowPayload, null, 2) }
  ];
  if (markdownText) {
    files.push({ name: `${nameBase}-review.md`, data: markdownText });
  }
  if (htmlText) {
    files.push({ name: `${nameBase}-review.html`, data: htmlText });
  }
  if (promptText) {
    files.push({ name: `${nameBase}-ai-prompt.txt`, data: promptText });
  }
  return files;
}

async function downloadZip(contest, selfUser, files) {
  const userSuffix = selfUser ? `-${selfUser}` : "";
  const filename = `atcoder-${contest}${userSuffix}-export-${timestampForFilename()}.zip`;
  await downloadZipByName(files, filename);
}

async function downloadZipByName(files, filename) {
  const blob = makeZip(files);
  const urlCtor = (typeof self !== "undefined" && self.URL)
    || (typeof URL !== "undefined" ? URL : null)
    || (typeof globalThis !== "undefined" ? globalThis.URL : null);
  const url = await blobToObjectUrl(blob);
  await chrome.downloads.download({ url, filename, saveAs: true });
  if (url.startsWith("blob:") && urlCtor?.revokeObjectURL) {
    setTimeout(() => urlCtor.revokeObjectURL(url), 60 * 1000);
  }
}

async function exportAll(contest, selfUser = null, basePayloadOverride = null, markdownText = null, promptText = null, htmlText = null) {
  const { basePayload, windowPayload } = await buildPayloads(contest, selfUser, basePayloadOverride);
  ensureSelfSubmissions(basePayload);
  let promptOut = promptText;
  if (!promptOut) {
    try {
      const settings = await loadAiSettings();
      const defaults = await loadDefaultPromptTemplates();
      const promptTemplate = (settings.promptTemplate || "").trim() || defaults.normal;
      const resolvedSelfUser = basePayload.selfUser || selfUser;
      const jsonText = JSON.stringify(windowPayload, null, 2);
      promptOut = await buildReviewPrompt(jsonText, {
        promptTemplate,
        selfUser: resolvedSelfUser,
        expectedExampleEnabled: settings.expectedExampleEnabled,
        expectedExampleText: settings.expectedExampleText
      });
    } catch (e) {
      // 失敗してもエクスポート自体は続行する
      console.warn("Failed to build prompt for export:", e);
    }
  }
  const files = await prepareExportFiles(contest, selfUser, basePayload, windowPayload, markdownText, promptOut, htmlText);
  await downloadZip(contest, selfUser, files);
}

async function exportAllCachedZip() {
  const records = await listExportsFull();
  if (!records.length) return { ok: false, error: "キャッシュがありません" };

  const settings = await loadAiSettings();
  const defaults = await loadDefaultPromptTemplates();
  const promptTemplate = (settings.promptTemplate || "").trim() || defaults.normal;
  const expectedExampleEnabled = settings.expectedExampleEnabled;
  const expectedExampleText = settings.expectedExampleText;

  const files = [];
  const skipped = [];
  const sortedRecords = records.slice().sort((a, b) => {
    const ta = new Date(a.savedAt || 0).getTime();
    const tb = new Date(b.savedAt || 0).getTime();
    return ta - tb;
  });
  let entryIndex = 0;
  for (let i = 0; i < sortedRecords.length; i++) {
    const rec = sortedRecords[i];
    try {
      const contest = rec.contest;
      const selfUser = rec.selfUser || null;
      const basePayload = rec.json ? JSON.parse(rec.json) : (await loadBasePayloadFromCacheOrDb(contest, selfUser, true)).payload;
      const { basePayload: bp, windowPayload } = await buildPayloads(contest, selfUser, basePayload);
      ensureSelfSubmissions(bp);
      const reviews = normalizeReviewsFromRecord(rec);
      const reviewEntries = reviews.length ? reviews : [null];
      for (let r = 0; r < reviewEntries.length; r++) {
        const review = reviewEntries[r];
        let promptOut = review?.prompt || null;
        if (!promptOut) {
          try {
            const resolvedSelfUser = bp.selfUser || selfUser;
            const jsonText = JSON.stringify(windowPayload, null, 2);
            promptOut = await buildReviewPrompt(jsonText, {
              promptTemplate,
              selfUser: resolvedSelfUser,
              expectedExampleEnabled,
              expectedExampleText
            });
          } catch (e) {
            console.warn("Failed to build prompt for export:", e);
          }
        }
        const idPrefix = String(++entryIndex).padStart(4, "0");
        const entrySavedAt = review?.savedAt || rec.savedAt || null;
        const folder = [
          "atcoder",
          safePathSegment(contest, "contest"),
          safePathSegment(selfUser || "self", "self"),
          formatSavedAtForPath(entrySavedAt)
        ].join("-");
        const folderWithId = `${idPrefix}-${folder}`;
        const entryFiles = await prepareExportFiles(
          contest,
          selfUser,
          bp,
          windowPayload,
          review?.markdown || null,
          promptOut,
          review?.html || null
        );
        for (const f of entryFiles) {
          files.push({ ...f, name: `${folderWithId}/${f.name}`, date: entrySavedAt || f.date });
        }
      }
    } catch (e) {
      skipped.push({ contest: rec.contest, selfUser: rec.selfUser || null, error: String(e?.message || e) });
    }
  }

  if (!files.length) return { ok: false, error: "エクスポート対象のデータがありません" };
  const filename = `atcoder-exports-${timestampForFilename()}.zip`;
  await downloadZipByName(files, filename);
  return { ok: true, count: records.length, skipped };
}

async function cacheExportPayload(contest, selfUser = null, basePayloadOverride = null, limit = 100) {
  const { basePayload } = await buildPayloads(contest, selfUser, basePayloadOverride);
  const meta = await saveExportPayload(basePayload, limit);
  return { ok: true, ...meta };
}

async function broadcastProgress(contest, text, isError = false, done = false, progress = null) {
  const pct = progress === null ? null : clampProgress(progress);
  const msg = { type: "progress", contest, text, isError, done, progress: pct };
  try { await chrome.runtime.sendMessage(msg); } catch { /* popup may be closed */ }

  try {
    const data = await chrome.storage.local.get("progress_state");
    const state = data.progress_state || {};
    const prev = state[contest] || {};
    state[contest] = {
      ...prev,
      contest,
      text,
      isError,
      done,
      running: !done,
      progress: pct === null ? prev.progress : pct,
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({ progress_state: state });
  } catch {
    // ignore storage failures
  }
}

async function clearProgressState(contest) {
  try {
    const data = await chrome.storage.local.get("progress_state");
    const state = data.progress_state || {};
    if (contest && state[contest]) {
      delete state[contest];
      await chrome.storage.local.set({ progress_state: state });
    }
  } catch {
    // ignore storage errors
  }
}

function providerLabel(provider) {
  return {
    openai: "ChatGPT",
    gemini: "Gemini",
    claude: "Claude"
  }[provider] || provider || "AI";
}

async function buildReviewPrompt(
  jsonText,
  {
    contest = null,
    promptTemplate = null,
    selfUser = null,
    expectedExampleEnabled = true,
    expectedExampleText = DEFAULT_EXPECTED_EXAMPLE,
    promptTemplateAhc = null,
    expectedExampleEnabledAhc = true,
    expectedExampleTextAhc = DEFAULT_EXPECTED_EXAMPLE_AHC
  } = {}
) {
  const defaults = await loadDefaultPromptTemplates();
  const resolvedPromptTemplate = (promptTemplate || "").trim() || defaults.normal;
  const resolvedPromptTemplateAhc = (promptTemplateAhc || "").trim() || defaults.ahc;

  // AHC判定してプロンプトを選択
  const isAhc = isAhcContest(contest);
  const selectedPromptTemplate = isAhc ? resolvedPromptTemplateAhc : resolvedPromptTemplate;
  const selectedExpectedEnabled = isAhc ? expectedExampleEnabledAhc : expectedExampleEnabled;
  const selectedExpectedText = isAhc ? (expectedExampleTextAhc || DEFAULT_EXPECTED_EXAMPLE_AHC) : (expectedExampleText || DEFAULT_EXPECTED_EXAMPLE);
  const defaultExpectedText = isAhc ? DEFAULT_EXPECTED_EXAMPLE_AHC : DEFAULT_EXPECTED_EXAMPLE;

  let head = (selectedPromptTemplate || (isAhc ? defaults.ahc : defaults.normal)).trim() || (isAhc ? defaults.ahc : defaults.normal);

  // $target_user プレースホルダーを置き換える
  let targetUser = selfUser;
  if (!targetUser) {
    const settings = await loadAppSettings();
    targetUser = settings.selfUser;
  }
  head = head.replace(/\$target_user/g, targetUser);

  if (selectedExpectedEnabled) {
    const fallback = (selectedExpectedText !== undefined && selectedExpectedText !== null)
      ? selectedExpectedText
      : defaultExpectedText;
    const example = (fallback || defaultExpectedText || "").trim();
    if (example) {
      const replaced = example.replace(/\$target_user/g, targetUser);
      head = `${head}\n\n---\n# 期待出力例\n${replaced}`;
    }
  }

  return `${head}\n\n今回添削対象のデータ：\n${jsonText}`;
}

async function loadAppSettings() {
  const data = await chrome.storage.local.get("app_settings");
  const s = data.app_settings || {};
  return { selfUser: normalizeSelfUser(s.selfUser) };
}

async function resolveSelfUser(preferred) {
  return normalizeSelfUser(preferred);
}

async function loadAiSettings() {
  const data = await chrome.storage.local.get("ai_settings");
  const s = data.ai_settings || {};
  const defaults = await loadDefaultPromptTemplates();
  const provider = s.provider || null;
  const models = s.models || {};
  const apiKeys = s.apiKeys || {};
  const model = provider ? (models[provider] || s.model || null) : null;
  const apiKey = provider ? apiKeys[provider] : null;
  const promptTemplate = s.promptTemplate || defaults.normal;
  const expectedExampleEnabled = s.expectedExampleEnabled !== undefined ? Boolean(s.expectedExampleEnabled) : true;
  const expectedExampleText = s.expectedExampleText !== undefined ? s.expectedExampleText : DEFAULT_EXPECTED_EXAMPLE;
  const promptTemplateAhc = s.promptTemplateAhc || defaults.ahc;
  const expectedExampleEnabledAhc = s.expectedExampleEnabledAhc !== undefined ? Boolean(s.expectedExampleEnabledAhc) : true;
  const expectedExampleTextAhc = s.expectedExampleTextAhc !== undefined ? s.expectedExampleTextAhc : DEFAULT_EXPECTED_EXAMPLE_AHC;
  return {
    provider,
    model,
    apiKey,
    models,
    apiKeys,
    promptTemplate,
    expectedExampleEnabled,
    expectedExampleText,
    promptTemplateAhc,
    expectedExampleEnabledAhc,
    expectedExampleTextAhc
  };
}

async function callOpenAI({ apiKey, model, prompt, signal }) {
  const modelName = (model || "").toLowerCase();
  const isReasoningModel = modelName.startsWith("gpt-5") || modelName.startsWith("o3") || modelName.includes("thinking");

  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "text" }
  };

  if (isReasoningModel) {
    // GPT-5.x / o3 series: use top-level reasoning_effort (chat completions API)
    body.reasoning_effort = "medium"; // avoid "none" per requirement
  } else {
    body.temperature = 0.2;
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API ${res.status}: ${errText || res.statusText}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI API から応答を取得できませんでした");
  return text;
}

async function callGemini({ apiKey, model, prompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    }),
    signal: aiSignal()
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${errText || res.statusText}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini API から応答を取得できませんでした");
  return text;
}

async function callClaude({ apiKey, model, prompt }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096
    }),
    signal: aiSignal()
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${errText || res.statusText}`);
  }
  const data = await res.json();
  const parts = data?.content || [];
  const text = parts.map(p => p.text || "").join("").trim();
  if (!text) throw new Error("Claude API から応答を取得できませんでした");
  return text;
}

async function callAiProvider({ provider, model, apiKey, prompt }) {
  const signal = aiSignal();
  if (provider === "openai") return await callOpenAI({ apiKey, model, prompt, signal });
  if (provider === "gemini") return await callGemini({ apiKey, model, prompt });
  if (provider === "claude") return await callClaude({ apiKey, model, prompt });
  throw new Error("未対応のプロバイダです");
}

async function exportMarkdown(markdown, contest) {
  const safe = (markdown || "").trim() || "AI応答が空でした。";
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(safe)}`;
  const filename = `atcoder-${contest}-review-${timestampForFilename()}.md`;
  await chrome.downloads.download({ url, filename, saveAs: true });
}

async function runAiReview(contest, progressBase = 90, progressRange = 10, payloadOverride = null, selfUser = null, returnMarkdown = false) {
  startAiRun(contest);
  const base = Number(progressBase) || 0;
  const range = Math.max(1, Number(progressRange) || 10);
  const startPct = clampProgress(base);
  const endPct = clampProgress(base + range);

  try {
    throwIfAiCancelled();
    await broadcastProgress(contest, "AI添削の準備中…", false, false, startPct);
    throwIfAiCancelled();

    const settings = await loadAiSettings();
    throwIfAiCancelled();
    if (!settings.provider || !settings.model || !settings.apiKey) {
      throw new Error("AI設定が不足しています。オプションページでプロバイダ/モデル/APIキーを設定してください。");
    }

    let basePayload = null;
    if (payloadOverride) {
      basePayload = { ...payloadOverride };
      if (basePayload.selfUser === undefined) basePayload.selfUser = normalizeSelfUser(selfUser);
    } else {
      basePayload = await buildExportPayload(contest, { selfUser });
    }
    ensureSelfSubmissions(basePayload);
    const { windowPayload } = await deriveWindowPayload(basePayload, contest);
    throwIfAiCancelled();
    const jsonText = JSON.stringify(windowPayload, null, 2);
    const defaults = await loadDefaultPromptTemplates();
    const promptTemplate = (settings.promptTemplate || "").trim() || defaults.normal;
    const resolvedSelfUser = basePayload.selfUser || selfUser;
    const prompt = await buildReviewPrompt(jsonText, {
      contest,
      promptTemplate,
      selfUser: resolvedSelfUser,
      expectedExampleEnabled: settings.expectedExampleEnabled,
      expectedExampleText: settings.expectedExampleText,
      promptTemplateAhc: settings.promptTemplateAhc,
      expectedExampleEnabledAhc: settings.expectedExampleEnabledAhc,
      expectedExampleTextAhc: settings.expectedExampleTextAhc
    });

    await broadcastProgress(contest, `${providerLabel(settings.provider)}でAI添削中…`, false, false, startPct + (range * 0.35));
    throwIfAiCancelled();
    const markdown = await callAiProvider({
      provider: settings.provider,
      model: settings.model,
      apiKey: settings.apiKey,
      prompt
    });
    throwIfAiCancelled();

    if (returnMarkdown) {
      await broadcastProgress(contest, "AI添削完了", false, true, endPct);
      return { ok: true, progressSent: true, markdown, prompt, provider: settings.provider, model: settings.model };
    }

    await broadcastProgress(contest, "結果を保存中（ZIP作成中）…", false, false, startPct + (range * 0.75));
    throwIfAiCancelled();
    await exportAll(contest, selfUser, basePayload, markdown, prompt);
    throwIfAiCancelled();

    await broadcastProgress(contest, "AI添削完了（ZIPをダウンロード完了）", false, true, endPct);
    return { ok: true, progressSent: true };
  } catch (e) {
    if (isAiCancelledError(e)) {
      await broadcastProgress(contest, "AI添削を中止しました", false, true, startPct);
      await clearProgressState(contest);
      return { ok: false, cancelled: true, progressSent: true };
    }
    throw e;
  } finally {
    aiRunCtx = null;
  }
}

async function clearContest(contest) {
  return await tx(["submissions", "users", "tasks", "exports", "meta"], "readwrite", async ({ submissions, users, tasks, exports: exp, meta }) => {
    // delete submissions by contest index
    const sidx = submissions.index("contest");
    const urange = IDBKeyRange.only(contest);

    await cursorDeleteAll(sidx, urange);

    const uidx = users.index("contest");
    await cursorDeleteAll(uidx, urange);

    const tidx = tasks.index("contest");
    await cursorDeleteAll(tidx, urange);

    const eidx = exp.index("contest");
    await cursorDeleteAll(eidx, urange);

    const metaKey = metaKeyForContestWindow(contest);
    await reqToPromise(meta.delete(metaKey));
    await deleteMetaByPrefix(meta, `top_user_checked::${contest}::`);

    return { ok: true };
  });
}

async function cursorDeleteAll(index, range) {
  await new Promise((resolve, reject) => {
    const cur = index.openCursor(range);
    cur.onsuccess = (e) => {
      const c = e.target.result;
      if (!c) return resolve();
      c.delete();
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "db_upsert_submissions") {
        const res = await upsertSubmissions(msg.items || []);
        sendResponse({ ok: true, ...res });
        return;
      }
      if (msg?.type === "set_contest_window") {
        const res = await setContestWindow(msg.contest, msg.window || null);
        sendResponse({ ok: Boolean(res.ok), ...res });
        return;
      }
      if (msg?.type === "db_upsert_users") {
        const res = await upsertUsers(msg.contest, msg.users || []);
        sendResponse({ ok: true, ...res });
        return;
      }
      if (msg?.type === "db_clear_users") {
        await clearUsersByContest(msg.contest);
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "db_upsert_tasks") {
        const res = await upsertTasks(msg.contest, msg.tasks || []);
        sendResponse({ ok: true, ...res });
        return;
      }
      if (msg?.type === "db_list_users") {
        const users = await listUsers(msg.contest, msg.limit || null);
        sendResponse({ ok: true, users });
        return;
      }
      if (msg?.type === "has_export") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const rec = msg.cacheKey
          ? await getExportPayloadByKey(msg.cacheKey)
          : await getExportPayload(msg.contest, selfUser);
        sendResponse({
          ok: true,
          has: Boolean(rec),
          selfUser,
          savedAt: rec?.savedAt || null,
          size: rec?.size || null,
          tasksCount: rec?.tasksCount || 0,
          mySubmissionsCount: rec?.mySubmissionsCount || 0,
          topSubmissionsCount: rec?.topSubmissionsCount || 0
        });
        return;
      }
      if (msg?.type === "get_cached_data") {
        try {
          const selfUser = await resolveSelfUser(msg.selfUser);
          const targetUsers = msg.targetUsers || [];
          const [tasksCount, topUsersCount, submissionCounts] = await Promise.all([
            countByContest("tasks", msg.contest),
            countByContest("users", msg.contest),
            countSubmissionsByContest(msg.contest, selfUser)
          ]);
          const topSubmissionsCount = submissionCounts.top || 0;
          const mySubmissionsCount = submissionCounts.my || 0;
          const hasCachedTasks = tasksCount > 0;
          let hasCachedTopUsers = topUsersCount > 0 && topSubmissionsCount > 0;
          const hasCachedMySubmissions = mySubmissionsCount > 0;

          // targetUsersが指定されている場合、各ユーザーの提出有無を確認
          let missingUsers = [];
          if (targetUsers.length > 0) {
            for (const username of targetUsers) {
              const userSubs = await countUserSubmissions(msg.contest, username);
              if (userSubs === 0) {
                const checked = await hasTopUserChecked(msg.contest, username);
                if (!checked) missingUsers.push(username);
              }
            }
            hasCachedTopUsers = missingUsers.length === 0;
          }

          sendResponse({
            ok: true,
            selfUser,
            hasCachedTasks,
            hasCachedTopUsers,
            hasCachedMySubmissions,
            tasksCount,
            topUsersCount,
            topSubmissionsCount,
            mySubmissionsCount,
            missingUsers
          });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        return;
      }
      if (msg?.type === "cache_export") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const res = await cacheExportPayload(msg.contest, selfUser);
        sendResponse(res);
        return;
      }
      if (msg?.type === "mark_top_user_checked") {
        const res = await markTopUserChecked(msg.contest, msg.user);
        sendResponse(res);
        return;
      }
      if (msg?.type === "save_review_cache") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const res = await updateExportReview(msg.contest, selfUser, {
          reviewId: msg.reviewId,
          markdown: msg.markdown,
          prompt: msg.prompt,
          html: msg.html,
          aiProvider: msg.aiProvider,
          aiModel: msg.aiModel
        }, msg.cacheKey || null);
        sendResponse(res);
        return;
      }
      if (msg?.type === "get_cached_review") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const rec = msg.cacheKey
          ? await getExportPayloadByKey(msg.cacheKey)
          : await getExportPayload(msg.contest, selfUser);
        const { review } = selectReviewFromRecord(rec, msg.reviewId);
        sendResponse({
          ok: true,
          has: Boolean(review?.markdown || review?.html),
          selfUser,
          reviewId: review?.id || null,
          markdown: review?.markdown || null,
          prompt: review?.prompt || null,
          html: review?.html || null,
          aiProvider: review?.aiProvider || null,
          aiModel: review?.aiModel || null
        });
        return;
      }
      if (msg?.type === "export_cached_json") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const rec = msg.cacheKey
          ? await getExportPayloadByKey(msg.cacheKey)
          : await getExportPayload(msg.contest, selfUser);
        const { review } = selectReviewFromRecord(rec, msg.reviewId);
        const basePayload = rec?.json ? JSON.parse(rec.json) : (await loadBasePayloadFromCacheOrDb(msg.contest, selfUser, true)).payload;
        const markdownText = review?.markdown || null;
        const promptText = review?.prompt || null;
        const htmlText = review?.html || null;
        await exportAll(msg.contest, selfUser, basePayload, markdownText, promptText, htmlText);
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "ai_review_cached") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const base = msg.progressBase ?? 0;
        const range = msg.progressRange ?? 10;
        const returnMarkdown = msg.returnMarkdown ?? false;
        try {
          const { payload } = await loadBasePayloadFromCacheOrDb(msg.contest, selfUser, true);
          console.log(`AI review using cached payload for ${msg.contest}: ${payload.tasks?.length || 0} tasks`);
          const res = await runAiReview(msg.contest, base, range, payload, selfUser, returnMarkdown);
          sendResponse(res);
        } catch (e) {
          const fallbackPct = clampProgress(Number(base) || 0);
          await broadcastProgress(msg.contest, String(e?.message || e), true, true, fallbackPct);
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        return;
      }
      if (msg?.type === "get_prompt") {
        try {
          const selfUser = await resolveSelfUser(msg.selfUser);
          const { payload: basePayload } = await loadBasePayloadFromCacheOrDb(msg.contest, selfUser, true);
          console.log(`Loading cached payload for ${msg.contest}: ${basePayload.tasks?.length || 0} tasks, ${basePayload.mySubmissions?.length || 0} my submissions`);
          ensureSelfSubmissions(basePayload);
          const { windowPayload } = await deriveWindowPayload(basePayload, msg.contest);
          const jsonText = JSON.stringify(windowPayload, null, 2);
          const settings = await loadAiSettings();
          const defaults = await loadDefaultPromptTemplates();
          const promptTemplate = (settings.promptTemplate || "").trim() || defaults.normal;
          const resolvedSelfUser = basePayload.selfUser || selfUser;
          const prompt = await buildReviewPrompt(jsonText, {
            contest: msg.contest,
            promptTemplate,
            selfUser: resolvedSelfUser,
            expectedExampleEnabled: settings.expectedExampleEnabled,
            expectedExampleText: settings.expectedExampleText,
            promptTemplateAhc: settings.promptTemplateAhc,
            expectedExampleEnabledAhc: settings.expectedExampleEnabledAhc,
            expectedExampleTextAhc: settings.expectedExampleTextAhc
          });
          sendResponse({ ok: true, prompt });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        return;
      }
      if (msg?.type === "list_exports") {
        const list = await listExportsMeta();
        sendResponse({ ok: true, list });
        return;
      }
      if (msg?.type === "export_all_cached_zip") {
        const res = await exportAllCachedZip();
        sendResponse(res);
        return;
      }
      if (msg?.type === "delete_export") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const ck = msg.cacheKey || null;
        if (msg.reviewId || msg.reviewSavedAt) {
          await deleteExportReview(msg.contest, selfUser, msg.reviewId || null, msg.reviewSavedAt || null, ck);
        } else {
          await deleteExport(msg.contest, selfUser, ck);
        }
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "clear_exports") {
        await clearExports();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "cancel_ai_review") {
        const cancelled = cancelAiRun(msg.contest);
        await clearProgressState(msg.contest);
        sendResponse({ ok: true, cancelled });
        return;
      }
      if (msg?.type === "export_jsonl") {
        const selfUser = await resolveSelfUser(msg.selfUser);
        const extras = await loadExportExtras(msg.contest, selfUser);
        await exportAll(msg.contest, selfUser, extras.basePayload, extras.markdown, extras.prompt, extras.html);
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "export_json") {
        try {
          const selfUser = await resolveSelfUser(msg.selfUser);
          const extras = await loadExportExtras(msg.contest, selfUser);
          await exportAll(msg.contest, selfUser, extras.basePayload, extras.markdown, extras.prompt, extras.html);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        return;
      }
      if (msg?.type === "ai_review") {
        const base = msg.progressBase ?? 0;
        const range = msg.progressRange ?? 10;
        const returnMarkdown = msg.returnMarkdown ?? false;
        try {
          const selfUser = await resolveSelfUser(msg.selfUser);
          const res = await runAiReview(msg.contest, base, range, null, selfUser, returnMarkdown);
          sendResponse(res);
        } catch (e) {
          const fallbackPct = clampProgress(Number(base) || 0);
          await broadcastProgress(msg.contest, String(e?.message || e), true, true, fallbackPct);
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        return;
      }
      if (msg?.type === "clear_contest") {
        const res = await clearContest(msg.contest);
        sendResponse(res);
        return;
      }
      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true; // async
});
