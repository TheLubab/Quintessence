after attempting to build a starting version, i quickly come to realize i'm focusing on the wrong thing.

UI is not the product. UI is an expression of a product.

The actual product is Data Transformation & Transmission.

That's why software exists, it takes one data form and ethier transform it to another form in the same place, or it transmits it to someone else or to your future self.

To reinvent the experience of human computer interactions, I have to stop thinking in terms of UI. And I hate to start thinking in terms of Data Transformation & Transmission then express that in an intuitive way. 

The origin of software is the Terminal, and that remains true until today, I personally prefer terminal for everything that a terminal can do including typing this. But other people dislike it and would rather use a GUI that is dedicated to the task, for example notion or obsidian, because it's easier to see through hierchy (that's what i believe GUI is just hierchy) over scrolling text. 

However, LLMs are expressed through a chatbot which share many similarities with the Terminal, you type a prompt/command, you get results back. It's great for people who know exactly what to type and what they want. But it introduces huge friction to those who don't, therefore they still don't use LLMs match.

Reason LLMs are stuck in chats because they are literally text generators, they don't have any intruinsic understanding of GUI. And if you try to let LLMs generate GUI they would generate what humans already created for decades but much worst. 

My previous hypothesis was that maybe LLMs were just slow at generating GUIs, if they did it very quickly it, would solve the issue. But the experience told me that's just the least part of the problem. 


Which led me to a new hypothesis, we don't need UI at all, in the whole history of computers we needed a way to communicate with our computers, starting from terminals and cli commands, to UIs that gets more complex overtime, but UI was not something that people loved, it was always something people were forced to learn and use out of neccessity. All UIs are a ways to "command" the computer. But with our current technology, we don't need to command the computer anymore, we can just use it intuitively.


My chain of thoughts is messy and broken, but let me try to show what i mean.


Imagine the following workflow/scenario: 

```markdown
Kevin, n accountant has an **input** — excel file containing monthly expenses —

He performs the following **operations** (transforms):
- Calculate totals
- Check figures
- Format the table
- Export it to PDF

Then, He receives an **output** — pdf file containing monthly expenses report —

Finally, He sends (**transmit**) it another person (finance manager).
```

Every step there is a step doable in the terminal, I have done similar things thousands times with `jq` and other programs. But why Kevin didn't use a Terminal? because it's harder to learn. Not simple hard to use, a terminal can be many times more effiecient, but it takes time to learn all the commands. Therefore, Kevin and others use a GUI which also difficult but takes less time to learn.  


A terminal can do all of that, and even do things like send an email or whatever, and GUI is an abstraction over that designed specifically for the human ability to recognize visual hierchy, then LLM will be thousands times better at a terminal than they will ever be at GUI. And GUI job wouldn't exist anymore.


The conclusion is **we don't need GUI**, and we should not try to make GUI intuitive, that will never happen, GUI already reached it's peak with UX studies. 


The next progress of computers, would be to do the same process — **input** -> **operations** -> **output** -> **transmition** — But with less friction, but same reliability.


Using Kevin workflow as example, that's already very easily doable today with LLMs chatboxes and agents, Kevin would upload the Excel file to the agent and asks it to do the operations, and receives the output, and uses for example an MCP to send it to someone else.

The issue with that is that it's the same story with the terminal yet again, you have to interact with a scrolling text, type commands/prompts, and wait.

And the same way we moved away from verbose terminals, the next logical step is to move away from verbose LLMs. 

Which basically means remove the chat completely. Kevin doesn't need to talk to an LLM to do his job, the same way he don't need to read a terminal log, it's just something that happens in the background for debugging.


Kevin should be able to do his full workflow with minimum cognitive friction, he shouldn't have to type a prompt, because llms can infer his intuition from the file itself, he would just direct the operations. 


Kevin however should absolutely be **the decision maker** since he got the massive real world context.  


What does that mean for the interface?


We went from 

1. Terminal
2. GUI
3. LLMs
4. ?

The next have to be a complete new experience, a new HCI. And I believe the answer is Adaptive UI, or we can call it AUI. 

Since commands are not necessary anymore, we can infer a lot from **input**, that means our computers should know what **operations** we want to do dirctly from the **input**. 


Let's image how the AUI would look like.


Imagine an empty white window. Kevin sits with his excel file on the desktop. He drags it and drop it into the window. The window can infer that the file is an excel file for monthly expenses, therefore the window gives him options of everything possible to do with that input in a connected way, kevin have to simple click what step to take, until all his workflow is done. For example, since trust is low, kevin would also see every progress live to gain trust.

Now imagine the same window can do anything, a simple white empty window. A user drags his video presentation there, he wants to edit it, the window should adapt to the input and shows the user the operations he can take.

Now imagine that being done for every type of input we may have. That would tronsforming digital data from a form to another form.

However, there are other transformations human make, for example a huge part of using computers is transformation of toughts into digital data, in this way humans are still required to outputs thoughts somehow usually through typing or voice, in such cases, a chat or an audio button may remain necessary. But it would work as part of the whole adaptive flow. Once the user mind is fully in context, then chat would not be necessary anymore.

And I want to make a bet in the opposite direction of most AI companies. My bet is that LLMs shouldn't talk with humans in 90% of the cases, and should not display any behavior that may imitate humans. Instead the AI should remain in the background of every task, doing the hard parts, and presenting the users with intuitive results instead of text.


That's my thesis. The challenge that remains now is actually building one.


It seems that I was not the first to come up with the idea of an Adaptive UI (https://en.wikipedia.org/wiki/Adaptive_user_interface)

But also, it seems it was limited because of the difficulty of the implementation which is completely solved with LLMs today.

## Implementation

How does a computer looks like if it didn't have UI? IT would be an empty page of course.

But users would still need to interact with it somehow, the goal is to simply reduce the overlead, not completely remove it. Even tho that is possible with voice assistants, but that also is underserving the users.

Users do need to see cause and effect, they need to be able to input, they need to be able to make decisions. But they don't need to do the operations themselves. 

Therefore AUI (Adaptive UI) have to be able to communicate that with users, it should show the input and what you could do with it and the output and the process.

Unlike GUI, AUI doesn't need to be learned or mastered, therefore it doesn't have to be rigid, it can be as fluid as possible, but it remains very important to be intuitive. 


Honestly, I'm not sure if HTML is a good way to achieve this, since HTML is designed for rendering documents, we don't want documents.

I think this is a point where HTML and markup model be abandoned for something more dynamic. 


The markup is not intuitive for data relation. Markup is only intuitive for text and documents. and if we don't work with text anymore, then markup is pointless.


Actions shouldn't sit in a toolbar, they should exist in relation to the data attached to it. They should have physical relationship with the user and other data. The user doesn't simply trigger few CSS transition, but it should feel like they influence an environment, like in real physics.
