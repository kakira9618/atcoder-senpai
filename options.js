const DEFAULT_PROMPT_PATH = "prompts/default_prompt.txt";
const DEFAULT_PROMPT_AHC_PATH = "prompts/default_prompt_ahc.txt";

const DEFAULT_EXPECTED_EXAMPLE = [
  '# ABC219 分析レポート',
  '',
  'AtCoder ABC218におけるあなたの提出と、上位3名（contestant_A, contestant_B, contestant_C）の提出データを比較・解析しました。',
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
  '- **比較対象上位者**: contestant_A (1位), contestant_B (2位), contestant_C (3位)',
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
  'AtCoder Heuristic Contest 003における$target_userの提出と、上位3名の提出データを比較・解析しました。',
  'このコンテストは「ナップサック問題の変形」で、限られた計算時間内でできるだけ高いスコアを目指す問題でした。',
  '',
  '## 概要',
  '',
  '- **コンテスト**: AHC003',
  '- **対象ユーザー**: target_user',
  '- **比較対象上位者**: contestant_A (1位), contestant_B (2位), contestant_C (3位)',
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
  '*   **上位者との差:** 最終的に約2倍のスコア差があります。アルゴリズムの選択とパラメータチューニングに改善の余地があります。',
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
  '### 上位者のアプローチ',
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
  'あなたの初期解は完全ランダムですが、上位者は貪欲法やビームサーチで良い初期解を構築しています。',
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
  '上位者のコードから推測される良いパラメータ設定：',
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

const DEFAULT_SETTINGS = {
  promptTemplate: "",
  expectedExampleEnabled: true,
  expectedExampleText: DEFAULT_EXPECTED_EXAMPLE,
  promptTemplateAhc: "",
  expectedExampleEnabledAhc: true,
  expectedExampleTextAhc: DEFAULT_EXPECTED_EXAMPLE_AHC,
  apiKeys: {
    openai: "",
    gemini: "",
    claude: ""
  }
};

const els = {};
function cacheElements() {
  els.keyOpenAI = document.getElementById("key-openai");
  els.keyGemini = document.getElementById("key-gemini");
  els.keyClaude = document.getElementById("key-claude");
  els.promptTemplate = document.getElementById("prompt-template");
  els.expectedToggle = document.getElementById("expected-example-toggle");
  els.expectedText = document.getElementById("expected-example-text");
  els.promptTemplateAhc = document.getElementById("prompt-template-ahc");
  els.expectedToggleAhc = document.getElementById("expected-example-toggle-ahc");
  els.expectedTextAhc = document.getElementById("expected-example-text-ahc");
  els.status = document.getElementById("status");
  els.btnSave = document.getElementById("btnSave");
  els.btnReset = document.getElementById("btnReset");
  els.btnDefault = document.getElementById("btnDefault");
  els.btnPromptDefault = document.getElementById("btnPromptDefault");
  els.btnExpectedDefault = document.getElementById("btnExpectedDefault");
  els.btnPromptDefaultAhc = document.getElementById("btnPromptDefaultAhc");
  els.btnExpectedDefaultAhc = document.getElementById("btnExpectedDefaultAhc");
  els.tabNormal = document.getElementById("tab-normal");
  els.tabAhc = document.getElementById("tab-ahc");
  els.tabContentNormal = document.getElementById("tab-content-normal");
  els.tabContentAhc = document.getElementById("tab-content-ahc");
}

function setStatus(text, isError = false) {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.style.color = isError ? "#c00" : "#475569";
}

async function loadTextFile(path) {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return await res.text();
}

async function loadDefaultPromptTemplates() {
  try {
    const [normalPrompt, ahcPrompt] = await Promise.all([
      loadTextFile(DEFAULT_PROMPT_PATH),
      loadTextFile(DEFAULT_PROMPT_AHC_PATH)
    ]);
    DEFAULT_SETTINGS.promptTemplate = normalPrompt;
    DEFAULT_SETTINGS.promptTemplateAhc = ahcPrompt;
  } catch (e) {
    console.warn("Failed to load default prompts:", e);
  }
}

function mergeSettings(saved = {}) {
  return {
    promptTemplate: saved.promptTemplate || DEFAULT_SETTINGS.promptTemplate,
    expectedExampleEnabled: saved.expectedExampleEnabled !== undefined ? Boolean(saved.expectedExampleEnabled) : DEFAULT_SETTINGS.expectedExampleEnabled,
    expectedExampleText: saved.expectedExampleText !== undefined ? saved.expectedExampleText : DEFAULT_SETTINGS.expectedExampleText,
    promptTemplateAhc: saved.promptTemplateAhc || DEFAULT_SETTINGS.promptTemplateAhc,
    expectedExampleEnabledAhc: saved.expectedExampleEnabledAhc !== undefined ? Boolean(saved.expectedExampleEnabledAhc) : DEFAULT_SETTINGS.expectedExampleEnabledAhc,
    expectedExampleTextAhc: saved.expectedExampleTextAhc !== undefined ? saved.expectedExampleTextAhc : DEFAULT_SETTINGS.expectedExampleTextAhc,
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(saved.apiKeys || {}) }
  };
}

function applyToForm(aiSettings) {
  const ai = aiSettings || DEFAULT_SETTINGS;
  els.keyOpenAI.value = ai.apiKeys.openai || "";
  els.keyGemini.value = ai.apiKeys.gemini || "";
  els.keyClaude.value = ai.apiKeys.claude || "";
  els.promptTemplate.value = ai.promptTemplate || "";
  if (els.expectedToggle) {
    els.expectedToggle.checked = !!ai.expectedExampleEnabled;
  }
  if (els.expectedText) {
    els.expectedText.value = ai.expectedExampleText || "";
    updateExpectedDisabledState();
  }
  if (els.promptTemplateAhc) {
    els.promptTemplateAhc.value = ai.promptTemplateAhc || "";
  }
  if (els.expectedToggleAhc) {
    els.expectedToggleAhc.checked = !!ai.expectedExampleEnabledAhc;
  }
  if (els.expectedTextAhc) {
    els.expectedTextAhc.value = ai.expectedExampleTextAhc || "";
    updateExpectedDisabledStateAhc();
  }
}

function readFromForm() {
  return {
    promptTemplate: els.promptTemplate.value,
    expectedExampleEnabled: Boolean(els.expectedToggle?.checked),
    expectedExampleText: els.expectedText?.value || "",
    promptTemplateAhc: els.promptTemplateAhc?.value || "",
    expectedExampleEnabledAhc: Boolean(els.expectedToggleAhc?.checked),
    expectedExampleTextAhc: els.expectedTextAhc?.value || "",
    apiKeys: {
      openai: (els.keyOpenAI.value || "").trim(),
      gemini: (els.keyGemini.value || "").trim(),
      claude: (els.keyClaude.value || "").trim()
    }
  };
}

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get("ai_settings");
    const mergedAi = mergeSettings(data.ai_settings || {});
    applyToForm(mergedAi);
    setStatus("読み込み完了");
  } catch (e) {
    setStatus(`読み込みに失敗しました: ${e?.message || e}`, true);
  }
}

async function saveSettings() {
  try {
    const existing = (await chrome.storage.local.get("ai_settings")).ai_settings || {};
    const fromForm = readFromForm();
    if (!validateApiKeys(fromForm.apiKeys)) {
      return;
    }
    const aiSettings = {
      ...existing,
      ...fromForm,
      apiKeys: { ...existing.apiKeys, ...fromForm.apiKeys }
    };
    await chrome.storage.local.set({ ai_settings: aiSettings });
    setStatus("保存しました");
  } catch (e) {
    setStatus(`保存に失敗しました: ${e?.message || e}`, true);
  }
}

function validateApiKeys(apiKeys = {}) {
  const rules = [
    { key: "openai", prefix: "sk-", label: "ChatGPT (OpenAI)" },
    { key: "gemini", prefix: "AIza", label: "Gemini" },
    { key: "claude", prefix: "sk-ant-", label: "Claude" }
  ];
  for (const { key, prefix, label } of rules) {
    const v = (apiKeys[key] || "").trim();
    if (!v) continue;
    if (!v.startsWith(prefix)) {
      alert(`${label} のAPIキーが正しくなさそうです。\n${prefix} で始まる形式か確認してください。`);
      return false;
    }
  }
  return true;
}

function applyDefaultsToForm() {
  applyToForm(DEFAULT_SETTINGS);
  setStatus("デフォルトを適用しました（未保存）");
}

function applyDefaultPrompt() {
  els.promptTemplate.value = DEFAULT_SETTINGS.promptTemplate;
  setStatus("プロンプトをデフォルトに戻しました（未保存）");
}

function applyDefaultExpected() {
  if (els.expectedText) {
    els.expectedText.value = DEFAULT_EXPECTED_EXAMPLE;
    updateExpectedDisabledState();
    setStatus("期待出力例をデフォルトに戻しました（未保存）");
  }
}

function applyDefaultPromptAhc() {
  if (els.promptTemplateAhc) {
    els.promptTemplateAhc.value = DEFAULT_SETTINGS.promptTemplateAhc;
    setStatus("AHC用プロンプトをデフォルトに戻しました（未保存）");
  }
}

function applyDefaultExpectedAhc() {
  if (els.expectedTextAhc) {
    els.expectedTextAhc.value = DEFAULT_EXPECTED_EXAMPLE_AHC;
    updateExpectedDisabledStateAhc();
    setStatus("AHC用期待出力例をデフォルトに戻しました（未保存）");
  }
}

function updateExpectedDisabledState() {
  if (!els.expectedToggle || !els.expectedText) return;
  const enabled = Boolean(els.expectedToggle.checked);
  els.expectedText.disabled = !enabled;
  els.expectedText.parentElement?.classList.toggle("disabled", !enabled);
}

function updateExpectedDisabledStateAhc() {
  if (!els.expectedToggleAhc || !els.expectedTextAhc) return;
  const enabled = Boolean(els.expectedToggleAhc.checked);
  els.expectedTextAhc.disabled = !enabled;
  els.expectedTextAhc.parentElement?.classList.toggle("disabled", !enabled);
}

function switchTab(tabName) {
  if (tabName === 'normal') {
    els.tabNormal?.classList.add('active');
    els.tabAhc?.classList.remove('active');
    els.tabContentNormal?.classList.add('active');
    els.tabContentAhc?.classList.remove('active');
  } else if (tabName === 'ahc') {
    els.tabNormal?.classList.remove('active');
    els.tabAhc?.classList.add('active');
    els.tabContentNormal?.classList.remove('active');
    els.tabContentAhc?.classList.add('active');
  }
}

async function initOptions() {
  cacheElements();
  await loadDefaultPromptTemplates();
  await loadSettings();
  els.btnSave.addEventListener("click", saveSettings);
  els.btnReset.addEventListener("click", loadSettings);
  els.btnDefault.addEventListener("click", applyDefaultsToForm);
  els.btnPromptDefault.addEventListener("click", applyDefaultPrompt);
  if (els.btnExpectedDefault) els.btnExpectedDefault.addEventListener("click", applyDefaultExpected);
  if (els.btnPromptDefaultAhc) els.btnPromptDefaultAhc.addEventListener("click", applyDefaultPromptAhc);
  if (els.btnExpectedDefaultAhc) els.btnExpectedDefaultAhc.addEventListener("click", applyDefaultExpectedAhc);
  if (els.expectedToggle) els.expectedToggle.addEventListener("change", updateExpectedDisabledState);
  if (els.expectedToggleAhc) els.expectedToggleAhc.addEventListener("change", updateExpectedDisabledStateAhc);
  if (els.tabNormal) els.tabNormal.addEventListener("click", () => switchTab('normal'));
  if (els.tabAhc) els.tabAhc.addEventListener("click", () => switchTab('ahc'));
}

document.addEventListener("DOMContentLoaded", () => {
  initOptions().catch((e) => {
    console.error("Failed to initialize options:", e);
    setStatus(`初期化に失敗しました: ${e?.message || e}`, true);
  });
});
