---
layout: post
title: 下一种吹学即将奏响——AI吹学初探
author: 当代闲人
original: https://www.bilibili.com/read/cv33623376/
header-img: 
catalog: true
tags:
    - bilibili
    - 理论天地
---
作者：书虫(1, 2, 3, 4)； 当代闲人(1, 3, 4, 5) 

中国吹学科学院三香研究院； 

中国吹学科学院北中研究院高坂丽奈研究中心；

中国吹学科学院川岛绿辉哲学思想研究中心；

中国吹学科学院南中研究院；

中国吹学科学院梨梨花几何研究中心；

通讯作者：书虫（ @神采洋），email：chong.shu@hibike.ac.cn                   

&emsp;&emsp;&emsp;&emsp;&emsp;当代闲人（ @当代闲人 ），email：xianren.dangdai@hibike.ac.cn 



<div style="width: 750px; margin: auto;"><h1 style="text-align:center;line-height:1.75;font-family:-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif;font-size:1.2em;font-weight:bold;display:table;margin:2em auto 1em;padding:0 1em;border-bottom:2px solid rgba(15, 76, 129, 1);color:#3f3f3f;margin-top: 0">引言</h1></div>

&emsp;&emsp;2024年4月7日，京吹宇宙诞生正值“久”周年，北宇治吹奏部奋三世余烈勇夺全国金之路亦将走向最后一程。



&emsp;&emsp;这“久”年间，吹学研究蓬勃发展，涌现出一大批领军吹学家，为探求京吹真理而前赴后继。然而，吹学研究面临着一个重大矛盾：一方面，吹学的至高真理是无限的，仰之弥高、钻之弥深；另一方面，吹学家的生命却是有限的，人生匆匆数十载，在吹学真理面前犹如蜉蝣。这样的残酷现实呼唤着一种新的吹学，一种能让吹学家在有限的生命里追寻无限的吹学真理，但又不至落入“以有涯随无涯，殆已”的困境之中的吹学。如何发展出这种新吹学，可谓是“新时代吹学的根本难题”（The Fundamental Problem of Neo-Hibikeology）。



&emsp;&emsp;古人云，一个学科的命运，当然要靠研究者的自我奋斗，但也要考虑到历史的行程。纵览人类历史发展的潮流，笔者认为，这下一种吹学正是AI吹学。AlphaGo、chatGPT等AI系统的出现，已经深刻变革了几乎所有学术领域。作为人类知识体系中不可分割的关键一环，吹学自不能逆潮流而行。事实上，将AI全面引入吹学研究不仅是解决新时代吹学根本难题的关键举措，更是将吹学研究推向新高度的必由之路。历史将证明，在未来的AI吹学中，吹学家只要充分利用AI强大的能力，就能够创造性地发现新的高价值吹学课题，并自动化、并行化地攻克吹学难题，实现在有限的生命里一睹吹学真理的宏愿。



&emsp;&emsp;秉承“做特别的人”的吹学精神，在以chatGPT为代表的生成式AI诞生之初，笔者就对其在吹学研究中的应用做了一些粗浅的探索。最初的方案主要是结合大语言模型和检索增强生成技术，在调用大模型前，从一个外部知识库（例如《武吹原典》）中检索出与问题最相关的文本作为上下文。不幸的是，此方案无法让模型对整部作品产生宏观的理解，因而效果并不理想。然而，随着模型上下文窗口容量的增加，将整部小说纳入对话分析已变得可行。趁着拥有高达100万tokens处理能力的Gemini 1.5 Pro正式开放的历史机遇，笔者开始了新一轮的尝试，并取得了一些初步的研究发现。兹将相关研究结果分享给吹学同仁。


<div style="width: 750px; margin: auto;"><h1 style="text-align:center;line-height:1.75;font-family:-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif;font-size:1.2em;font-weight:bold;display:table;margin:2em auto 1em;padding:0 1em;border-bottom:2px solid rgba(15, 76, 129, 1);color:#3f3f3f;margin-top: 0">AI吹学初探</h1></div>

&emsp;&emsp;吹学研究主要分为**实证吹学**、**诠释吹学**和**预测吹学**三大类，分别关注考据京吹和武吹之中关键事实的实证性问题，解读关键角色和事件的诠释性问题，以及预测黄前大统领毕业后北宇治吹奏部的未来以及其它原著中没有答案的问题的预测性问题。针对这三大研究领域，笔者做了一些初步探索，现报告如下：



&emsp;&emsp;笔者首先上传了武吹原典《吹响吧！上低音号》，发现所有本文资料只大约占用了77万tokens，在Gemini 1.5 Pro的处理能力内。





<h2 style="text-align:center;line-height:1.75;font-family:-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif;font-size:1.2em;font-weight:bold;display:table;margin:4em auto 2em;padding:0 0.2em;background:rgba(15, 76, 129, 1);color:#fff;margin-top: 0">1. 实证吹学问题（原作中有明确答案的问题）</h2>




&emsp;&emsp;我们发现，大模型在回答这类事实性问题时表现出色，展现出对语义多样性的强大适应性，至少已经达到了初级实证吹学家的水平。可见，AI现阶段就可在实证吹学研究领域大展拳脚。



<h2 style="text-align:center;line-height:1.75;font-family:-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif;font-size:1.2em;font-weight:bold;display:table;margin:4em auto 2em;padding:0 0.2em;background:rgba(15, 76, 129, 1);color:#fff;margin-top: 0">2. 诠释吹学问题（原作中没有直接答案，需要深入理解和诠释）</h2>




&emsp;&emsp;面对诠释性问题，AI的理解能力受到了挑战。首先，我们来审视一下第一个回答。任何对京吹战力系统稍有研究的吹学家都会指出，AI的回答犯了一个明显的错误。关于谁是北宇治历史上第二厉害的吹奏手，或许存在一定的争议空间；但若论谁是第一，铠冢霙的地位是毫无疑问的。确实，AI能够识别出高坂丽奈技术的卓越性，这一点值得肯定。然而，在需要从更宏观的视角对比角色吹奏技能时，尤其是在小说中并未直接将铠冢霙和高板丽奈进行比较的情况下，模型的表现就显得有些力不从心了。



&emsp;&emsp;接下来让我们分析第二个回答。在这一部分，模型似乎强行将铠冢霙和斋藤葵与数学联系起来，这种关联显得过于牵强，而真正的数学奇才——上数学课时不听讲，却能用数学语言为久石奏写下情书，同时还在数学测验中获得年级第一的剑崎·高斯·梨梨花，似乎被完全忽略了。笔者有尝试问“谁在数学测试中拿了年级第一？”，得到了剑崎梨梨花的正确答案，但提问“梨梨花的数学天赋如何？”时，大模型的回答就不知所云了。



<h2 style="text-align:center;line-height:1.75;font-family:-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif;font-size:1.2em;font-weight:bold;display:table;margin:4em auto 2em;padding:0 0.2em;background:rgba(15, 76, 129, 1);color:#fff;margin-top: 0">3. 预测吹学问题（原作中不存在答案，需要分析和推测）</h2>




&emsp;&emsp;在第一个回答中，尽管大模型通读了《武吹原典》，但却没研读过任何一篇吹学论文，所以得出了历史选择了久石奏的错误结论也就不奇怪了。事实上，学界早已就剑崎梨梨花同志接班的正统性和合法性做了严格的论证 ↓

&emsp;&emsp;[为什么剑崎梨梨花是北宇治吹奏部的下届部长？——驳《为什么历史选择了久石奏》](/2020/02/06/weishenmelishixuanzeleririka/)



&emsp;&emsp;第二个回答涉及吹学殿堂中的圣杯——伞学，笔者认为自己尚未达到能够对其做出评价的水平。因此，笔者将这个问题留给广大的伞学家们，由他们来做出专业的判断。




<div style="width: 750px; margin: auto;"><h1 style="text-align:center;line-height:1.75;font-family:-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif;font-size:1.2em;font-weight:bold;display:table;margin:2em auto 1em;padding:0 1em;border-bottom:2px solid rgba(15, 76, 129, 1);color:#3f3f3f;margin-top: 0">结论</h1></div>

&emsp;&emsp;笔者的初步研究显示，目前的大模型在理解和推理能力、特别是全局注意力方面仍有所不足。尽管AI在解决实证吹学问题时表现良好，但要胜任诠释吹学和预测吹学研究工作，还有一段路需要走。可即便如此，长上下文技术的突破也已经让AI吹学的发展迈出了坚实的一步，随着未来更为强大的AI的到来（例如，山姆·奥特曼提到的在写作能力上取得巨大进步的GPT-5），AI吹学的发展前景更是不可限量。下一种即将奏响的吹学，正是AI吹学。

* * *

&emsp;&emsp;P.S. 插播一条来自大模型的温馨提示
