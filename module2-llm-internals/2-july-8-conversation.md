# July 8 Conversation: Toy Decoder Transformer Slide Walkthrough

This note captures the tutoring session for the PDF `Tutor Number Slideshow · Toy Decoder Transformer.pdf`. The user asked to explain the deck slide by slide, starting with slide 1, and to use vision when needed. Early in the conversation, the response style was corrected to be conversational only: explain as if speaking live, avoid bullets unless necessary, avoid dense structure, and focus on clearing the exact confusion before moving on.

A reusable prompt for the same style would be: “Explain this transformer slide deck slide by slide in a conversational tutoring style. Keep it natural and spoken. Do not over-structure the answer. When I ask doubts, clear the confusion directly with simple examples, especially around token IDs, positions, embeddings, residual streams, Q, K, V, learned weights, inference, and variable sequence length.”

## Slide 1: What this deck is

The first slide sets up the whole toy world. The deck is not trying to mimic real GPT weights. It is creating a tiny decoder-only transformer where the numbers are small enough to follow by hand.

The prompt is “the dog bit.” The model maps those words to token IDs: “the” is 1, “dog” is 2, and “bit” is 3. Then the model follows the decoder-style forward pass: token IDs become embeddings, embeddings go through attention, the attention output is added back through a residual connection, the result goes through a feed-forward network, another residual addition happens, and finally the model produces logits for the next token.

The important numbers are that the prompt has 3 tokens, the model dimension is 4, there is one layer, one head, and the vocabulary size is 8. The point is the flow, not realistic model behavior.

A major confusion came up around position versus ID. Position means where the token appears in the prompt. In “the dog bit,” “the” is at position 0, “dog” is at position 1, and “bit” is at position 2. ID means which vocabulary entry the token is. In this toy vocabulary, “the” has ID 1, “dog” has ID 2, and “bit” has ID 3. So position tells the model where the token is, while ID tells the model what the token is.

The reason this was confusing is that the toy example uses numbers that almost line up. The positions are 0, 1, 2, and the IDs are 1, 2, 3. That makes it feel like they are related, but they are not. If the prompt were “bit the dog,” then “bit” would move to position 0, but it would still have ID 3. “the” would move to position 1, but it would still have ID 1.

Another confusion was vocabulary ID 0. In this slide, ID 0 looks blank. It should be treated as an unused or placeholder token in the toy vocabulary, not automatically as a space character. In real tokenizers, spaces can be part of tokens, but they are usually represented in a more tokenizer-specific way, not simply as blank ID 0.

## Slide 2: m is the number of input tokens

Slide 2 explains that the prompt “the dog bit” has three input tokens, so `m = 3`. The slide labels the three token positions as `x1`, `x2`, and `x3`, where `x1` is “the,” `x2` is “dog,” and `x3` is “bit.” This `x1`, `x2`, `x3` notation is just one-based labeling for explanation. It is separate from the zero-based positions and separate from vocabulary IDs.

The key idea is that a decoder transformer produces a prediction at every input position. After seeing “the,” it can predict what comes next. After seeing “the dog,” it can predict what comes next. After seeing “the dog bit,” it predicts the next token after the full prompt. For generation, we care about the prediction at the last input position.

So in this example we use `p3`, because the prompt has three tokens. If some other diagram uses `p4`, that does not mean the fourth generated token. It means the prediction made from the fourth input position in that diagram.

## Slide 3: Embedding lookup

Slide 3 is where the numbers begin. The model starts with token IDs `[1, 2, 3]`. It uses those IDs to select rows from the embedding matrix `E`. ID 1 selects the row for “the,” ID 2 selects the row for “dog,” and ID 3 selects the row for “bit.” The selected rows are stacked into a new matrix called `X`, the prompt embedding matrix.

In the toy example, “the” becomes `[1, 0, 0, 0.3]`, “dog” becomes `[0, 1, 0, 0.2]`, and “bit” becomes `[0, 0, 1, 0.2]`. The columns are labeled as determiner, noun, verb, and bias, but those labels are only for teaching. Real embedding dimensions are not normally this clean or human-readable.

The important mental model is that the model is no longer working with words at this point. It is working with vectors. `X` is the beginning of the residual stream, the main stream of numbers that will be updated by attention and the feed-forward network.

One doubt was whether these embeddings are manually designed. In this slide, they look manual because the toy example names dimensions like determiner, noun, and verb. In a real transformer, the embedding table is learned during training. The dimensions are distributed and messy. You usually cannot point to one dimension and say, “this one means noun.”

Another doubt was whether modern LLMs get their initial embeddings from BERT or another model. Usually, no. A decoder-only LLM has its own embedding matrix. During training, that embedding matrix is learned along with attention weights, feed-forward weights, and the rest of the model. During inference, the model simply looks up rows from its own learned embedding table.

Historically, before transformers became dominant, NLP systems often used downloadable static embeddings such as Word2Vec, GloVe, or fastText. Those embeddings were trained separately and could be plugged into other models. That could give a model a useful starting point. But for modern LLM pretraining, the embedding table is typically part of the model itself and is trained with the model.

A subtle correction was important: the raw embedding table does not become contextual in the usual sense. The row for “dog” is the same whenever that token ID appears. What becomes contextual is the hidden representation after attention layers process the token in a sentence. So the starting embedding for “dog” can be the same in “the dog bit” and “the dog ran,” but after attention, the representation of “dog” can differ because the surrounding context is different.

Another doubt was about initializing embeddings randomly versus using pretrained embeddings. Both are possible in some settings. A model can start with random embeddings and learn them through backpropagation. Historically, smaller NLP models often initialized with pretrained Word2Vec or GloVe embeddings to get a head start. But embeddings from another model are not automatically useful. They must be compatible with the tokenizer, vocabulary ordering, vector dimension, and the rest of the model. An embedding space is like an internal language; another model may not speak that language unless it was designed to.

## Slide 4: Residual stream

Slide 4 introduces the residual stream. `X` is the original stream of information after the embedding lookup. Attention computes an update called `C`. The model adds that update to `X`, giving `R1 = X + C`. Then the feed-forward network computes another update called `M`. The model adds that to `R1`, giving `R2 = R1 + M`.

The best spoken analogy from the session was the river analogy. `X` is the river of information flowing through the model. Attention pours `C` into the river. The feed-forward network pours `M` into the river. The river keeps moving; it is not replaced.

That is what residual means here. It does not mean the model skips attention or skips the feed-forward network. It means the old stream is preserved and the learned update is added to it.

The shape stays the same through this whole block. In the toy example, the prompt has 3 tokens and each token has 4 numbers, so the stream is `3 x 4`. After attention, after the first residual addition, after the feed-forward network, and after the second residual addition, the shape is still `3 x 4`. The values change, but the shape stays the same.

## Slide 5: Q, K, and V

Slide 5 starts the attention calculation. From the prompt embedding matrix `X`, the model creates three matrices: `Q`, `K`, and `V`. It does that by multiplying `X` by three learned matrices: `W_Q`, `W_K`, and `W_V`.

`Q` means query. It is the role where a token asks what kind of information it is looking for. `K` means key. It is the role where a token provides something that can be matched against. `V` means value. It is the content that gets carried forward if another token attends to this token.

The column labels `h0`, `h1`, `h2`, and `h3` just mean the four hidden dimensions of the vector. Since this toy model has `d_model = 4`, every token vector has four coordinates. These labels do not mean four attention heads. This example has one head.

A key clarification was that Q, K, and V are not attention weights yet. The model first compares queries against keys. It takes a query from one token and computes dot products with the keys of allowed tokens. Those scores say how well the query matches each key. Then the scores go through softmax, and only after that do they become attention weights. The attention weights say how much value-content to read from each token.

The library analogy helped a lot. The query is like walking into a library with the thought, “I want a book about economics.” The keys are like book titles, catalog entries, or labels on the spine that say what each book is about. You compare your query to the keys to decide which books are relevant. But the key is not the full content. Once you pick the book, you open it and read the actual contents. That content is the value.

In attention, the model usually does not pick just one book. It takes a weighted mixture. It might read 70 percent from one token, 20 percent from another, and 10 percent from another. Q and K decide where to read from. V is what gets read.

The row for “bit” shows the difference between these roles. In `X`, “bit” starts as `[0, 0, 1, 0.2]`, mostly verb-like in this toy setup. But in `Q`, the row for “bit” is `[1, 0, 0, 0.2]`. That means, in query-space, “bit” is looking strongly along the first dimension. In this toy, that can make it match strongly with the key for “the,” because “the” has a strong first-dimension key. Meanwhile, “bit” as a key and value is still `[0, 0, 1, 0.2]`, meaning it presents itself and carries content as verb-like information.

This is why separate Q, K, and V projections are useful. The same token may need to search for one kind of thing, be searchable as another kind of thing, and provide a third kind of content. If the model used one vector for all three jobs, it would be less flexible.

A major doubt was that the slide shows `Q = X · W_Q`, `K = X · W_K`, and `V = X · W_V`, but it does not show the actual `W_Q`, `W_K`, and `W_V` matrices. That is correct: the slide compresses that detail. In this toy model, `X` is `3 x 4`. Each of `W_Q`, `W_K`, and `W_V` would be `4 x 4`. Multiplying `3 x 4` by `4 x 4` gives another `3 x 4` matrix.

So `W_Q` is not a single vector. It is a learned matrix. The slide only shows the result after multiplication. In this toy setup, `K` and `V` look almost identical to `X`, which probably means the toy `W_K` and `W_V` are identity-like. `Q` changes more clearly; for example, “bit” changes from `[0, 0, 1, 0.2]` in `X` to `[1, 0, 0, 0.2]` in `Q`. That means the toy `W_Q` is remapping features so that “bit” asks for something like a determiner signal.

Another doubt was whether `W_Q`, `W_K`, and `W_V` are generated during inference. They are not. During training, these matrices are learned through backpropagation. At the end of training, they are frozen as part of the saved model weights. During inference, the user’s prompt changes, so `X` changes, but the same fixed `W_Q`, `W_K`, and `W_V` are reused.

This also answers the variable-length input question. If the prompt has 3 tokens, `X` is `3 x 4`. If the prompt has 10 tokens, `X` is `10 x 4`. The learned `W_Q` is still `4 x 4`. So `3 x 4` times `4 x 4` gives `3 x 4`, and `10 x 4` times `4 x 4` gives `10 x 4`. The number of rows can change with the number of tokens. The number of columns stays fixed because each token vector has the same model dimension.

Padding is a separate issue. Padding is often used during batching so multiple sequences can be processed together efficiently. But conceptually, attention can handle variable sequence length up to the model’s maximum context window. The Q/K/V projection itself does not require padding just because the prompt is shorter.

The clean mental model from the session is: training learns reusable transformations for asking, matching, and carrying information. Inference applies those same frozen transformations to whatever prompt is currently being processed, as long as the prompt is within the model’s context limit.

## Session response style to preserve

The user preferred a live tutoring style. The answer should sound like a person explaining the slide in real time. Start from the specific confusion, use simple analogies, and avoid unnecessary formal structure. When the user asks “clear any doubts,” restate the core doubt in plain language, correct the misconception gently, and give the clean mental model.

For this topic, the most effective recurring phrasing was: “where the token is” versus “what the token is” for position and ID; “the embedding table is a learned lookup table” for embeddings; “the raw embedding is static, the later hidden representation is contextual” for context; “the residual stream is a river” for residuals; and “Q and K decide where to read, V is what gets read” for attention.
