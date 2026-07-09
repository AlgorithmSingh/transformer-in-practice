The animation demo is created here:                                                    

 /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice/module2-llm-inte 
 rnals/mini-decoder-demo/
                                                                                              
 I verified it locally. It walks through token IDs, embeddings, Q/K/V, RoPE, causal masking,
 attention weights, A·V, residual adds, feed-forward, final unembedding, and predicts:        
                                                                                              
 the dog bit the
                                                                                              
 with p(the) = 0.354.                                                                         
                                                                                              
 To open it, run:
                                                                                              
 ```bash                                                                                      
   cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice
   python3 -m http.server --bind 127.0.0.1 8000                                               
 ```
                                                                                              
 Then open:

 http://127.0.0.1:8000/module2-llm-internals/mini-decoder-demo/

 If you want, I can also launch the server for you in a new terminal window.