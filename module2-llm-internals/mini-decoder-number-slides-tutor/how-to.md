 Done. I created a second version here:                                                       
                                                                                              
 transformer-in-practice/module2-llm-internals/mini-decoder-number-slides/                    
                                                                                              
 This one is built like a slideshow, with larger formulas, bigger number tables, and speaker  
 notes. It walks through the exact meeting flow: m = 3, token IDs, embeddings, Q/K/V, RoPE,   
 dot products, causal mask, softmax, A·V, residual add, FFN, second residual add,             
 unembedding, and final prediction.                                                           
                                                                                              
 It reuses the same verified math as the first demo, so the final prediction is still:        
                                                                                              
 the dog bit ___ → the dog bit the                                                            
                                                                                              
 with p(the) = 0.354.                                                                         
                                                                                              
 To run it:                                                                                   
                                                                                              
 ```bash                                                                                      
   cd /Users/ankitsingh/Documents/transformer-in-practice/transformer-in-practice             
   python3 -m http.server --bind 127.0.0.1 8000                                               
 ```                                                                                          
                                                                                              
 Then open:                                                                                   
                                                                                              
 http://127.0.0.1:8000/module2-llm-internals/mini-decoder-number-slides/                      
                                                                                              
 I also verified the math again, and it passes.                                               