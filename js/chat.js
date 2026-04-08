/* ═══════════════════════════════════════════════════════════════
   CARDÁPIO DIGITAL PRO — js/chat.js
   Chat em tempo real vinculado ao pedido (loja ↔ cliente).

   Firestore:
     chats/{orderId}                → metadados (expiresAt, autoCloseAt, status)
     chats/{orderId}/messages/{id}  → mensagens (texto + imageBase64)

   Regras de negócio:
   • Chat expira em 5 dias (expiresAt)
   • Fecha 1h após pedido 'delivered' ou 'cancelled' (autoCloseAt)
   • Imagens comprimidas via Canvas API (JPEG, max 900px, ~0.78 qual.)
   • Identificação por cargo: admin/worker ↔ customer (nome do pedido)
════════════════════════════════════════════════════════════════ */

const appChat = {

    // ── Estado reativo ───────────────────────────────────────────
    showChat: false,
    chatOrderId: null,
    chatOrder: null,
    chatMessages: [],
    chatInput: '',
    chatImageBase64: null,
    chatImagePreview: null,
    chatSending: false,
    chatLoading: false,
    chatClosed: false,
    chatClosedReason: '',    // 'expirado' | 'concluido' | 'fechado'
    chatEmojiOpen: false,
    chatEmojiSearch: '',
    chatViewingImage: null,  // base64 para lightbox
    _chatUnsub: null,
    _chatTicker: null,

    // ── Lista de Emojis (PT-BR, foco em chat/pedido) ────────────
    chatEmojis: [
        // Positivos / reações
        { e: '😀', n: 'feliz sorriso animado' },
        { e: '😁', n: 'animado feliz empolgado' },
        { e: '😊', n: 'satisfeito contente' },
        { e: '🥰', n: 'amor coração apaixonado' },
        { e: '😍', n: 'adorei incrível olhos' },
        { e: '🤩', n: 'impressionado estrelas' },
        { e: '😋', n: 'delicioso gostoso saboroso' },
        { e: '😎', n: 'legal ótimo óculos' },
        { e: '🤗', n: 'abraço carinhoso' },
        { e: '😇', n: 'obrigado gentil' },
        // Gestos
        { e: '👍', n: 'ótimo positivo joinha bom' },
        { e: '👎', n: 'ruim negativo não' },
        { e: '👏', n: 'parabéns aplausos' },
        { e: '🙏', n: 'obrigado por favor rezar' },
        { e: '🤝', n: 'combinado acordo parceria' },
        { e: '✌️', n: 'paz ok vitória dois' },
        { e: '🤙', n: 'liga me contato' },
        { e: '💪', n: 'força braço' },
        { e: '👌', n: 'perfeito ok' },
        { e: '🖐️', n: 'mão tchau oi' },
        // Negativos / dúvida
        { e: '😕', n: 'confuso dúvida' },
        { e: '🤔', n: 'pensando refletindo' },
        { e: '😟', n: 'preocupado triste' },
        { e: '😢', n: 'chorando triste' },
        { e: '😠', n: 'bravo irritado raiva' },
        { e: '😤', n: 'frustrado irritado' },
        { e: '🫤', n: 'mais ou menos' },
        { e: '😐', n: 'neutro sem expressão' },
        // Status / símbolos
        { e: '✅', n: 'ok confirmado certo' },
        { e: '❌', n: 'errado cancelado não' },
        { e: '⚠️', n: 'atenção aviso cuidado' },
        { e: '🔥', n: 'fogo quente urgente incrível' },
        { e: '⭐', n: 'estrela ótimo destaque' },
        { e: '❤️', n: 'amor coração' },
        { e: '💬', n: 'mensagem chat conversa' },
        { e: '📞', n: 'telefone ligar' },
        { e: '💡', n: 'ideia dica' },
        { e: '🎉', n: 'festa comemoração parabéns' },
        // Entrega / pedido
        { e: '🛵', n: 'moto entrega delivery' },
        { e: '📦', n: 'pacote caixa pedido' },
        { e: '🏃', n: 'correndo retirada rápido' },
        { e: '🕐', n: 'tempo espera relógio' },
        { e: '📍', n: 'localização endereço mapa' },
        { e: '🗺️', n: 'mapa rota caminho' },
        { e: '💳', n: 'cartão pagamento' },
        { e: '💰', n: 'dinheiro pagamento' },
        // Comida
        { e: '🍔', n: 'hamburguer lanche burger' },
        { e: '🍕', n: 'pizza' },
        { e: '🍟', n: 'batata frita fritas' },
        { e: '🌮', n: 'taco mexicano' },
        { e: '🥤', n: 'bebida refrigerante suco' },
        { e: '☕', n: 'café coffee' },
        { e: '🍰', n: 'bolo fatia sobremesa' },
        { e: '🍩', n: 'donut rosquinha' },
    ],

    get chatFilteredEmojis() {
        const q = (this.chatEmojiSearch || '').trim().toLowerCase();
        if (!q) return this.chatEmojis;
        return this.chatEmojis.filter(em => em.n.includes(q) || em.e.includes(q));
    },

    // ── Getter auxiliar: "sou eu" vs "outra parte" ───────────────
    // true → mensagem é do lado atual (aparece à direita)
    _chatIsSelf(msg) {
        const isStaff = this.isCloudAdmin || this.isCloudWorker;
        return msg.sender === (isStaff ? 'admin' : 'customer');
    },


    // ════════════════════════════════════════════════════════════
    // ABERTURA / FECHAMENTO
    // ════════════════════════════════════════════════════════════

    async openChat(order) {
        if (!order?.uuid) return;

        // Reset de estado
        this.chatOrderId = order.uuid;
        this.chatOrder = { ...order };
        this.chatMessages = [];
        this.chatInput = '';
        this.chatImageBase64 = null;
        this.chatImagePreview = null;
        this.chatEmojiOpen = false;
        this.chatEmojiSearch = '';
        this.chatClosed = false;
        this.chatClosedReason = '';
        this.chatViewingImage = null;
        this.chatLoading = true;
        this.showChat = true;

        await this._chatEnsureDoc(order);
        await this._chatCheckExpiry(order.uuid);
        this._chatSubscribe(order.uuid);
        this._chatStartTicker();
        this._chatCleanupExpired();   // best-effort sem await
    },

    closeChat() {
        this.showChat = false;
        this._chatUnsub?.();
        this._chatUnsub = null;
        this._chatStopTicker();
        setTimeout(() => {
            this.chatOrderId = null;
            this.chatOrder = null;
            this.chatMessages = [];
            this.chatInput = '';
            this.chatImageBase64 = null;
            this.chatImagePreview = null;
            this.chatClosed = false;
            this.chatClosedReason = '';
            this.chatViewingImage = null;
        }, 300);
    },


    // ════════════════════════════════════════════════════════════
    // FIRESTORE — DOC DO CHAT
    // ════════════════════════════════════════════════════════════

    async _chatEnsureDoc(order) {
        try {
            const ref = firestoreDb.collection('chats').doc(order.uuid);
            const snap = await ref.get();
            if (snap.exists) return;

            const now = new Date();
            const expires = new Date(now);
            expires.setDate(expires.getDate() + 5);   // expira em 5 dias

            await ref.set({
                orderId: order.uuid,
                orderNumber: order.orderNumber ?? '',
                customerName: order.name ?? '',
                customerPhone: order.phone ?? '',
                createdAt: now.toISOString(),
                expiresAt: expires.toISOString(),
                autoCloseAt: null,
                status: 'open',
                lastMessage: '',
                lastMessageAt: now.toISOString(),
            });
        } catch (e) {
            await this.logError?.(e.message || String(e),
                { source: '_chatEnsureDoc', orderId: order?.uuid, stack: e.stack || null }, 'chat');
        }
    },

    // Verifica expiração / auto-close e atualiza this.chatClosed
    async _chatCheckExpiry(orderId) {
        try {
            const ref = firestoreDb.collection('chats').doc(orderId);
            const snap = await ref.get();
            if (!snap.exists) return;

            const data = snap.data();
            const now = new Date();

            // 1. Expirado por 5 dias
            if (data.expiresAt && new Date(data.expiresAt) < now) {
                this.chatClosed = true;
                this.chatClosedReason = 'expirado';
                return;
            }

            // 2. Auto-close 1h após pedido concluído/cancelado
            if (data.autoCloseAt && new Date(data.autoCloseAt) < now) {
                this.chatClosed = true;
                this.chatClosedReason = 'concluido';
                if (data.status !== 'closed') await ref.update({ status: 'closed' });
                return;
            }

            // 3. Fechado manualmente
            if (data.status === 'closed') {
                this.chatClosed = true;
                this.chatClosedReason = 'fechado';
            }
        } catch (e) {
            await this.logError?.(e.message || String(e),
                { source: '_chatCheckExpiry', orderId, stack: e.stack || null }, 'chat');
        }
    },

    /**
     * Agenda fechamento automático do chat 1 hora após pedido
     * concluído (delivered) ou cancelado.
     * Chamado por omSetStatus em order-manager.js.
     */
    async chatScheduleClose(orderId) {
        if (!orderId) return;
        try {
            const closeAt = new Date();
            closeAt.setHours(closeAt.getHours() + 1);
            await firestoreDb.collection('chats').doc(orderId).update({
                autoCloseAt: closeAt.toISOString(),
            });
        } catch (_) {
            // Chat pode não existir — ignora silenciosamente
        }
    },


    // ════════════════════════════════════════════════════════════
    // REALTIME — MENSAGENS
    // ════════════════════════════════════════════════════════════

    _chatSubscribe(orderId) {
        this._chatUnsub?.();
        this._chatUnsub = firestoreDb
            .collection('chats').doc(orderId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(
                snap => {
                    this.chatLoading = false;
                    this.chatMessages = snap.docs.map(d => d.data());
                    setTimeout(() => this._chatScrollBottom(), 80);
                },
                err => {
                    this.chatLoading = false;
                    this.logError?.(err.message || String(err),
                        { source: '_chatSubscribe', orderId, stack: err.stack || null }, 'chat');
                },
            );
    },


    // ════════════════════════════════════════════════════════════
    // ENVIO DE MENSAGENS
    // ════════════════════════════════════════════════════════════

    async sendChatMessage() {
        const text = (this.chatInput || '').trim();
        if ((!text && !this.chatImageBase64) || this.chatSending || this.chatClosed) return;

        this.chatSending = true;
        try {
            const isStaff = this.isCloudAdmin || this.isCloudWorker;
            const msgId = this.uuid?.() ?? ('msg_' + Date.now());
            const now = new Date().toISOString();

            const msg = {
                id: msgId,
                text,
                imageBase64: this.chatImageBase64 ?? null,
                sender: isStaff ? 'admin' : 'customer',
                senderName: isStaff
                    ? (this.userProfile?.displayName
                        || this.cloudUser?.email?.split('@')[0]
                        || this.config?.restaurantName
                        || 'Loja')
                    : (this.chatOrder?.name ?? 'Cliente'),
                timestamp: now,
                read: false,
            };

            await firestoreDb
                .collection('chats').doc(this.chatOrderId)
                .collection('messages').doc(msgId)
                .set(msg);

            await firestoreDb.collection('chats').doc(this.chatOrderId).update({
                lastMessage: text || '📷 Imagem',
                lastMessageAt: now,
            });

            this.chatInput = '';
            this.chatImageBase64 = null;
            this.chatImagePreview = null;
            this.chatEmojiOpen = false;

        } catch (e) {
            await this.logError?.(e.message || String(e),
                { source: 'sendChatMessage', orderId: this.chatOrderId, stack: e.stack || null }, 'chat');
            this.showToast?.('Erro ao enviar mensagem.', 'error', '❌');
        } finally {
            this.chatSending = false;
        }
    },


    // ════════════════════════════════════════════════════════════
    // IMAGEM — COMPRESSÃO VIA CANVAS
    // ════════════════════════════════════════════════════════════

    async chatAttachImage(event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showToast?.('Selecione uma imagem (JPG, PNG, WebP).', 'error', '⚠️');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            this.showToast?.('Imagem muito grande. Máximo: 15 MB.', 'error', '⚠️');
            return;
        }

        try {
            const b64 = await this._chatCompress(file);

            // Segurança: base64 não pode exceder ~750KB (Firestore doc ≤ 1MB)
            if (b64.length > 1_000_000) {
                this.showToast?.('Imagem ainda muito grande mesmo após compressão.', 'error', '⚠️');
                return;
            }

            this.chatImageBase64 = b64;
            this.chatImagePreview = b64;
        } catch (e) {
            this.showToast?.('Falha ao processar imagem.', 'error', '❌');
        }

        try { event.target.value = ''; } catch (_) { }
    },

    /**
     * Comprime uma imagem usando Canvas API.
     * maxWidth: 900px  |  quality: 0.78 (JPEG)
     * Se o resultado ainda > 950KB, tenta quality 0.50.
     */
    _chatCompress(file, maxWidth = 900, quality = 0.78) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                let result = canvas.toDataURL('image/jpeg', quality);

                // Fallback: reduz ainda mais se necessário
                if (result.length > 950_000) {
                    result = canvas.toDataURL('image/jpeg', 0.50);
                }

                resolve(result);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Erro ao carregar imagem'));
            };

            img.src = url;
        });
    },


    // ════════════════════════════════════════════════════════════
    // TICKER — verificação periódica de expiração (1 min)
    // ════════════════════════════════════════════════════════════

    _chatStartTicker() {
        this._chatStopTicker();
        this._chatTicker = setInterval(async () => {
            if (this.chatOrderId && !this.chatClosed) {
                await this._chatCheckExpiry(this.chatOrderId);
            }
        }, 60_000);
    },

    _chatStopTicker() {
        clearInterval(this._chatTicker);
        this._chatTicker = null;
    },


    // ════════════════════════════════════════════════════════════
    // LIMPEZA — chats expirados (admin only, best-effort)
    // ════════════════════════════════════════════════════════════

    async _chatCleanupExpired() {
        if (!this.isCloudAdmin) return;
        try {
            const now = new Date().toISOString();
            const snap = await firestoreDb
                .collection('chats')
                .where('expiresAt', '<', now)
                .limit(10)
                .get();

            for (const doc of snap.docs) {
                // Remove mensagens da subcoleção
                const msgs = await doc.ref.collection('messages').limit(500).get();
                if (!msgs.empty) {
                    const batch = firestoreDb.batch();
                    msgs.docs.forEach(m => batch.delete(m.ref));
                    await batch.commit();
                }
                await doc.ref.delete();
            }
        } catch (_) { /* best-effort — silencioso */ }
    },


    // ════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════

    chatInsertEmoji(emoji) {
        this.chatInput += emoji;
        this.chatEmojiOpen = false;
        this.chatEmojiSearch = '';
    },

    _chatScrollBottom() {
        const el = document.getElementById('chat-msgs');
        if (el) el.scrollTop = el.scrollHeight;
    },

    chatFormatTime(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch { return ''; }
    },

    chatFormatDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const now = new Date();
            const diff = Math.floor((now - d) / 86_400_000);
            if (diff === 0) return 'Hoje';
            if (diff === 1) return 'Ontem';
            return d.toLocaleDateString('pt-BR');
        } catch { return ''; }
    },

    // Retorna true se esta mensagem deve exibir separador de data
    chatShowDate(index) {
        if (index === 0) return true;
        const prev = this.chatMessages[index - 1];
        const curr = this.chatMessages[index];
        if (!prev?.timestamp || !curr?.timestamp) return false;
        return new Date(prev.timestamp).toDateString() !==
            new Date(curr.timestamp).toDateString();
    },
};