<script setup lang="ts">
import { isPastDeadline, type Completion, type MainTask } from "#shared/utils/models";

const props = defineProps<{
  task: MainTask;
  completion?: Completion;
  /** Người dùng có quyền tích không (chỉ chủ sở hữu) */
  canAct: boolean;
  /** Tên người đã tích nếu không phải mình */
  tickedBy?: string | null;
}>();

const emit = defineEmits<{ complete: [] }>();

const { nowHHmm } = useClock();
const done = computed(() => !!props.completion);
const overdue = computed(() => !done.value && isPastDeadline(props.task, nowHHmm.value));
/** Đã xong là chốt, không bỏ tích */
const actionable = computed(() => props.canAct && !done.value && !overdue.value);

const primaryAction = () => {
  if (actionable.value) emit("complete");
};

/** Vuốt sang trái hay sang phải đều là hoàn thành */
const swipeAction = { label: "Hoàn thành", icon: "i-lucide-circle-check", class: "bg-green-600 text-white" };
</script>

<template>
  <SwipeableRow :left="swipeAction" :right="swipeAction" :disabled="!actionable" @swipe-left="primaryAction" @swipe-right="primaryAction">
  <div
    :class="[
      'flex items-start gap-3 rounded-xl border bg-white dark:bg-gray-900 p-3 shadow-sm transition',
      done ? 'border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/40' : overdue ? 'border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/30' : 'border-gray-200 dark:border-gray-800',
    ]"
  >
    <button
      type="button"
      :disabled="!actionable"
      :aria-label="done ? 'Đã hoàn thành' : overdue ? 'Đã quá hạn' : 'Hoàn thành'"
      class="mt-0.5 flex shrink-0 rounded-full disabled:opacity-50"
      @click="primaryAction"
    >
      <UIcon
        :name="done ? 'i-lucide-circle-check' : overdue ? 'i-lucide-circle-x' : 'i-lucide-circle'"
        :class="['h-7 w-7', done ? 'text-green-600' : overdue ? 'text-red-500' : 'text-gray-400']"
      />
    </button>

    <div class="min-w-0 flex-1">
      <p :class="['font-semibold leading-tight', done && 'text-gray-500 dark:text-gray-400 line-through']">
        {{ task.title }}
      </p>
      <p v-if="task.note" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{{ task.note }}</p>

      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        <UBadge v-if="overdue" color="error" variant="solid" size="sm" icon="i-lucide-alarm-clock-off">
          Quá hạn {{ task.deadlineTime }}
        </UBadge>
        <UBadge v-else-if="task.deadlineTime" color="error" variant="subtle" size="sm" icon="i-lucide-alarm-clock">
          Hạn {{ task.deadlineTime }}
        </UBadge>
        <UBadge v-if="task.reminderTime" color="warning" variant="subtle" size="sm" icon="i-lucide-bell">
          {{ task.reminderTime }}
        </UBadge>
        <UBadge v-if="done && tickedBy" color="info" variant="subtle" size="sm" icon="i-lucide-user">
          {{ tickedBy }} tích
        </UBadge>
        <span v-if="!canAct && !done" class="text-xs text-gray-400">Chỉ chủ sở hữu tích được</span>
      </div>
    </div>
  </div>
  </SwipeableRow>
</template>
