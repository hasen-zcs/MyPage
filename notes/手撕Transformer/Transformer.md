![[transformer架构.png]]
## 正文
终于咱们已经搭建完了所有的transformer内部组件，现在咱们来将transformer的内部组件拼凑起来，完全完成完整transformer模型


## 代码(这只是简单的预览，解析在下面，别被吓跑了)
```python
class Transformer(nn.Module):
    """
	    完整 Transformer 模型 — Vaswani et al., Sec 3.1
	    三个入口：forward() 训练, encode() 编码, decode() 解码（支持逐步生成）
    """
    def __init__(self, 
				src_vocab_size, 
				tgt_vocab_size, 
				d_model=512, 
				num_heads=8,
				num_encoder_layers=6, 
				num_decoder_layers=6, 
				d_ffn=2048, 
				dropout=0.1,
				max_len=5000, 
				pad_idx=0):
        super().__init__()
        self.d_model = d_model
        self.pad_idx = pad_idx
        self.src_embed = nn.Embedding(src_vocab_size, d_model)
        self.tgt_embed = nn.Embedding(tgt_vocab_size, d_model)
        self.pos_encoder = PositionalEncoding(d_model, dropout, max_len)
        self.encoder = nn.ModuleList([EncoderLayer(d_model, num_heads, d_ffn, dropout) for _ in range(num_encoder_layers)])
        self.decoder = nn.ModuleList([DecoderLayer(d_model, num_heads, d_ffn, dropout) for _ in range(num_decoder_layers)])
        self.linear = nn.Linear(d_model, tgt_vocab_size)
        self._init_weights()
	# 1.初始化权重
    def _init_weights(self):
        """Xavier uniform 初始化 — Vaswani et al., Sec 3.2.2"""
        for p in self.parameters():
            if p.dim() > 1:
                nn.init.xavier_uniform_(p)

    # -- 掩码生成
    
    def generate_square_subsequent_mask(self, sz):
        """
        因果掩码 — 下三角矩阵，True 表示可见。
        """
        mask = torch.tril(torch.ones(sz, sz)).bool()
        return mask

    def make_src_mask(self, src):
        """padding 掩码，返回 [batch, 1, 1, src_len] 支持广播。"""
        src_mask = (src != self.pad_idx).unsqueeze(1).unsqueeze(2)
        return src_mask

    def make_tgt_mask(self, tgt):
        """目标掩码 = 因果掩码 & padding 掩码。"""
        tgt_len = tgt.size(1)
        subsequent_mask = /
	        /self.generate_square_subsequent_mask(tgt_len).to(tgt.device)
        padding_mask = (tgt != self.pad_idx).unsqueeze(1).unsqueeze(2)
        return padding_mask & subsequent_mask

    # -- 前向传播
    def encode(self, src):
        src_padding_mask = self.make_src_mask(src)
        src_mask = src_padding_mask & src_padding_mask.transpose(-2, -1)
        
        src_embed = self.src_embed(src) * math.sqrt(self.d_model)
        src_embed = self.pos_encoder(src_embed)
        enc_output = src_embed
        for layer in self.encoder:
            enc_output = layer(enc_output, src_mask)
        return enc_output, src_padding_mask

    def decode(self, tgt, encoder_output, src_mask):
        tgt_mask = self.make_tgt_mask(tgt)
        tgt_embed = self.tgt_embed(tgt) * math.sqrt(self.d_model)
        tgt_embed = self.pos_encoder(tgt_embed)
        dec_output = tgt_embed
        for layer in self.decoder:
            dec_output = layer(dec_output, encoder_output, tgt_mask, src_mask)
        return dec_output

    def forward(self, src, tgt):
        encoder_output, src_mask = self.encode(src)
        decoder_output = self.decode(tgt, encoder_output, src_mask)
        output = self.linear(decoder_output)
        return output
```

## 类内方法解析
#### 初始化参数
```python
def _init_weights(self):
        """Xavier uniform 初始化 — Vaswani et al., Sec 3.2.2"""
        for p in self.parameters():
            if p.dim() > 1:
                nn.init.xavier_uniform_(p)
```
初始化所有模型内的参数，通过for循环遍历所有的参数，判断$p.dim()>1$的原因->因为一般dim=1的参数张量一般是偏执项参数，而偏执参数一般初始化为零，所以不需要参数初始化

#### 词嵌入
```python
		······
		
		self.src_embed = nn.Embedding(src_vocab_size, d_model)
        self.tgt_embed = nn.Embedding(tgt_vocab_size, d_model)
        
        ······
```
	词嵌入Embedding，作用是，将已经被分词器分好，经过字典转换成的词索引中的每一个索引，转换成维度为d_model长度的一维词向量
	例如句子"This is a pen" -分词->['This','is','a','pen'] -词典转换-> ['12','5','61','1'].shape(4) -词嵌入-> [[0.12,1.12,...],[2.1,0.24,...],...].shape(4, 512)

### 掩码部分
	掩码是transformer架构中十分重要的一个机制，它决定了模型能不能真正的理解语言的意思，掩码可以理解为一张挡板，掩码的大小对应于注意力分数score（也就是注意力中Q和K进行点积后得到的得分），用来遮挡score，在掩码是一个bool张量，掩码中为True的元素相对应score位置上的元素是模型能看到的，而掩码中为False的元素相对应的score位置上的元素模型是看不到的，这个样子我们就可以有选择性地让模型看到我们让他看到的内容。
#### 因果掩码
```python
def generate_square_subsequent_mask(self, sz):
        """
        因果掩码 — 下三角矩阵，True 表示可见。
        陌生操作：
		· torch.tril(input, diagonal):
			input：要改变的矩阵
			diagonal=0：保留主对角线及以下的元素信息，上三角全变为零。
			diagonal=k>0；保留主对角线上k条对角线及以下的元素信息，上三角全变为零。
			diagonal=k<0：保留主对角线下k条对角线及以下的元素信息，上三角全变为零。
        """
        mask = torch.tril(torch.ones(sz, sz)).bool()
        return mask
```
是一个下三角矩阵，其中下面的是True可见，上三角是False不可见，所以这样子就可以这样防止模型在生成的时候不会看到未来的信息，这样子自回归的时候就只会看到现在的和过去的信息。这个因果掩码使用在Decoder中的第一个MulHeadsAttention里面的，用来遮蔽目标语句
可视化：
```
# sz = 5 时，生成的下三角矩阵
[[True, False, False, False, False],   # 第0个位置只能看到自己
 [True, True,  False, False, False],   # 第1个位置能看到0和1
 [True, True,  True,  False, False],   # 第2个位置能看到0,1,2
 [True, True,  True,  True,  False],   # 第3个位置能看到0,1,2,3
 [True, True,  True,  True,  True ]]   # 第4个位置能看到全部
```

### Padding掩码
```python
def make_src_mask(self, src):
	"""padding 掩码，返回 [batch, 1, 1, src_len] 支持广播。"""
	src_mask = (src != self.pad_idx).unsqueeze(1).unsquee(2)
	return src_mask
```
	pad_idx是padding标记符，当向量要进行padding操作时用pad_idx进行paddinig
	padding：词向量因为每个句子的token数不一样，导致词向量的序列长度各不一样。如“Thank you”的序列长度是二，而“Nice to meet you”的系列长度为四。所以为了使得所有词向量的形状一样，我们会对词向量进行padding操作，将向量用指定的标识符进行填充，以此来让词向量们各自的序列长度一致，padding的占位符是没意义的，所以一般用0来填充。
	
· $(src != self.pad\_idx)$这个操作干的事是：将src向量中所有不等于pad_idx的元素标记为True，等于pad_idx的元素标记为False，这样子就生成了一个将padding位置遮挡好的掩码，这样子模型就可以不看到padding区域，更加的关注非padding区域，

### 因果&Padding掩码
```python
def make_tgt_mask(self, tgt):
        """目标掩码 = 因果掩码 & padding 掩码。"""
        tgt_len = tgt.size(1)
        subsequent_mask = generate_square_subsequent_mask(tgt_len).to(tgt.device)
        padding_mask = (tgt != self.pad_idx).unsqueeze(1).unsqueeze(2)
        return padding_mask & subsequent_mask
```
	这个掩码是将上面的两个合起来，既要遮住上三角区域，又要遮住padding区域，所以在这个return后面将padding_mask和subsequent_mask进行了一个&(与运算)操作，将只有两个都写着可以看(True)的时候可以被观看，而当有任何一个mask遮住了的区域，模型都不可以观看。

其他的按照模型进行拼接即可
```
encoder：
	Embadding->PositionalEncoding->MulHeadAttention->AddNorm->FFN->AddNorm->out

decoder:
	Embedding->PositionalEncoding->MulHeadAttention->AddNorm->CrossAttention->AddNorm->FFN->AddNorm
```

### 编码器层
这一层是模型用来提取文本特征的部分
```python
def encoder(self, src):
	"""数据流：src --[encoder]--> enc_output, src_mask"""
	src_padding_mask = self.make_src_mask(src)
	src_mask = src_padding_mask & src_padding_mask.transpose(-2, -1)
	
	src_embed = self.src_embed(src) * math.sqrt(self.d_model) 
	src_embed = self.pos_encoder(src_embed)
	for lay in self.encoder:
		src_embed = lay(src_embed, src_mask)

	return src_embed, src_padding_mask
```
注意:在这里我需要提醒一下encoder返回值是src_embed和src_padding_mask后面的哪一个是我们最需要注意的不要写成src_mask，如果写成了src_mask就会导致注意力机制里面的掩码形状与注意力得分的形状不匹配，导致报错，不要问我怎么知道的，我找报错找了个把小时 \*-\*

### 解码器层
这一层是模型进行和文本生成的部分
```python
def decoder(self, tgt, enc_output, src_mask):
	"""数据流：tgt, enc_output, src_mask --[decoder]--> dec_output"""
	tgt_mask = self.make_tgt_mask(tgt)
	tgt_embed = self.tgt_embed(tgt) * math.sqrt(self.d_model)
	tgt_embed = self.pos_encoder(tgt_embed)
	
	for lay in self.decoder:
		tgt_embed = lay(tgt_embed, enc_output, tgt_mask, src_mask)
	
	return tgt_embed
```

### 总体前向传播(forward)
	十分的简单，就是先经过encoder层，再经过decoder层，最后经过一个线性层输出后返回就行了
```python
def forward(self, src, tgt):
	enc_output, src_mask = self.encoder(src)
	tgt_output = self.decoder(tgt, enc_output, src_mask)
	ts_output = self.linear(tgt_output)
	return ts_output
```
	大家应该注意到再transfomer架构图上面有softmax层而我们在代码中没有写softmax，这是因为我们训练transformer时使用的交叉熵损失函数(CrossEntropyLoss)里面是自带softmax的要是在模型中加上了，会使得训练混乱所以我们不自己加
	在我们进行推理使用的时候，我们有几种使用方法
```python
output = model(src, tgt)
# 第一种、用argmax取出最大值索引，这种不需要softmax
indx = output.argmax(dim=-1)
# 第二种、需要概率值的时候，使用softmax
p = F.softmax(output, dim=-1)
# 方式3：如果要随机采样（如文本生成）
next_token = torch.multinomial(probs, num_samples=1)
"""torch.multinomial(input(概率分布), sample_num(采样数量))"""
```