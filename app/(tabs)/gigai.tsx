/**
 * Gig AI (tab) — asistente con tus datos locales.
 *
 * Requiere la suscripción del toolkit ($10/mes): sin acceso muestra el
 * Paywall. El chat usa answerQuery (reglas + SQLite); el LLM avanzado
 * queda como "próximamente" (ver askLLM en src/services/gigai.ts).
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Paywall } from '../../src/components/Paywall';
import {
  useToolkitAccess,
  subscribeToolkit,
} from '../../src/services/monetization';
import { answerQuery, type ChatMsg } from '../../src/services/gigai';
import { uid } from '../../src/utils/format';
import { useStrings } from '../../src/i18n';
import { theme } from '../../src/theme';

function Bubble({
  msg,
  onAction,
}: {
  msg: ChatMsg;
  onAction: (route: string) => void;
}) {
  const isUser = msg.from === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
          {msg.text}
        </Text>
        {msg.action ? (
          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            onPress={() => onAction(msg.action!.route)}
          >
            <Text style={styles.actionButtonText}>{msg.action.label} →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function GigAIScreen() {
  const t = useStrings();
  const [toolkitAccess, refreshToolkit] = useToolkitAccess();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 'gigai-init', from: 'bot', text: t.gigai.greeting },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const examples = t.gigai.examples;

  useFocusEffect(
    useCallback(() => {
      refreshToolkit();
    }, [refreshToolkit]),
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      setSending(true);
      const userMsg: ChatMsg = { id: uid(), from: 'user', text };
      setMessages((prev) => [userMsg, ...prev]);
      setInput('');
      try {
        const reply = await answerQuery(text);
        setMessages((prev) => [reply, ...prev]);
      } catch (err) {
        console.warn('[gigai] answerQuery falló:', err);
        setMessages((prev) => [
          {
            id: uid(),
            from: 'bot',
            text: t.gigai.queryError,
          },
          ...prev,
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, t],
  );

  const goAction = useCallback((route: string) => {
    router.push(route as never);
  }, []);

  if (!toolkitAccess) {
    return (
      <Screen scroll={false}>
        <Paywall
          title="Gig AI"
          priceText={t.common.perMonth}
          features={t.gigai.paywallFeatures}
          onBuy={async () => {
            await subscribeToolkit();
            refreshToolkit();
          }}
        />
      </Screen>
    );
  }

  const showExamples = messages.length === 1 && !sending;

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Text style={styles.title}>Gig AI</Text>

        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <Bubble msg={item} onAction={goAction} />}
        />

        {showExamples ? (
          <View style={styles.chips}>
            {examples.map((ex) => (
              <Pressable
                key={ex}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                onPress={() => send(ex)}
              >
                <Text style={styles.chipText}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {sending ? (
          <Text style={styles.typing}>{t.gigai.typing}</Text>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={t.gigai.inputPh}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable
            style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
            onPress={() => send(input)}
            disabled={sending}
          >
            <Text style={styles.sendButtonText}>{t.common.enviar}</Text>
          </Pressable>
        </View>

        <Text style={styles.note}>{t.gigai.note}</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 8,
  },
  list: {
    paddingVertical: 8,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowBot: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleUser: {
    backgroundColor: theme.primary,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: theme.card,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: theme.text,
  },
  bubbleTextBot: {
    color: theme.text,
  },
  actionButton: {
    marginTop: 8,
    backgroundColor: theme.text,
    borderRadius: theme.radiusPill,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    color: theme.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  typing: {
    fontSize: 13,
    color: theme.textMuted,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: theme.card,
  },
  sendButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: theme.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.85,
  },
  note: {
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
});
