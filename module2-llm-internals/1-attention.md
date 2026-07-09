0:01
Welcome to Module 2.
0:02
You've seen how the model behaves.
0:04
The loop, the sampling, the behaviors that fall out of the process.
0:08
But everything so far has been about what the model does, not how it does it.
0:13
So up until now, you've been treating the LLM as a black box.
0:16
Tokens go in and tokens come out.
0:19
So in this module, you're going to go look inside of this black box, inside of this transformer,
0:24
starting with the most important piece of it, called attention.
0:27
And that's the mechanism that makes it so that the next token it predicts is context-aware from the input.
0:32
And the reason for this is because the model needs to understand what words mean in context, just like you or I do.
0:38
So in the context of the dog bit, and the word bit, it's a dog biting something.
0:43
But if it's a little bit, where the word bit means something small, or if it's just a bit, it's a single bit of data.
0:50
The word bit could mean so many different things, and the context really matters to understand what that meaning is.
0:55
So let's take a look by walking through how an input sequence gets prepared for the model.
1:00
So you can take the input, the dog bit, and you can look at how it's encoded for the model first.
1:05
So every sequence, it gets broken down into these tokens.
1:08
Each token gets assigned an ID.
1:10
So you have an ID, and that's an ID inside of your entire vocabulary.
1:13
And here, the token ID for bit is 2699.
