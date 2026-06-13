<template>
  <v-card flat :style="`background-color: ${tab.secondaryColor}`" tile>
    <v-card-text style="height: fit-content" class="text-center py-8 px-0">
      <div style="font-size: 120px" class="py-12 white--text font-weight-bold">
        {{ formattedTime }}
      </div></v-card-text
    >
    <v-card-actions
      class="d-flex justify-center pb-6"
      style="position: relative"
    >
      <v-btn
        text
        elevation="3"
        width="200"
        height="50"
        @click="toggleTimer"
        :class="`${tab.color}--text font-weight-bold`"
        style="font-size: 22px; letter-spacing: normal; background-color: white"
        >{{ timerRunning ? "Pause" : "Start" }}</v-btn
      >
      <v-btn
        icon
        x-large
        dark
        v-if="tab.name != 'Long Break' && timerRunning"
        style="position: absolute; right: 15px"
        @click="skipTimer"
      >
        <v-icon>mdi-skip-next</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
<script>
import appConfig from "~/config/app.js";
export default {
  props: {
    item: {
      type: Object,
      required: true,
    },
    tasks: {
      type: Array,
      required: true,
    },
    inPomodoro: {
      type: Boolean,
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      // Clone để không mutate object dùng chung trong appConfig
      tab: { ...this.item },
      timer: null,
      timerRunning: false,
      endTime: null,
      originalPeriodOfTime: null,
      audioAlert: null,
      audioLofi: null,
    };
  },
  watch: {
    item(value) {
      this.tab = { ...value };
    },
    inPomodoro(value) {
      if (!this.isActive) return;
      if (value) {
        this.startTimer();
      } else {
        this.skipTimer();
      }
    },
    isActive(value) {
      if (!value && this.timerRunning) {
        this.skipTimer();
      }
    },
  },
  created() {
    this.originalPeriodOfTime = this.tab.periodOfTime;
    if (this.inPomodoro && this.isActive) {
      this.startTimer();
    }
  },
  mounted() {
    this.audioAlert = new Audio("/alert.mp3");
    this.audioLofi = new Audio("/lofi.mp3");
  },
  computed: {
    formattedTime() {
      const minutes = Math.floor(this.tab.periodOfTime / 60);
      const seconds = this.tab.periodOfTime % 60;
      return `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    },
  },
  methods: {
    startTimer() {
      if (this.timer) return;
      this.audioLofi.loop = true;
      this.audioLofi.play().catch(() => {});
      // Tính theo mốc thời gian kết thúc để tránh trôi (drift)
      this.endTime = Date.now() + this.tab.periodOfTime * 1000;
      this.timerRunning = true;
      this.$emit("changeStatus", true);
      this.timer = setInterval(() => {
        const remaining = Math.round((this.endTime - Date.now()) / 1000);
        if (remaining > 0) {
          this.tab.periodOfTime = remaining;
        } else {
          this.tab.periodOfTime = 0;
          this.handleTimerEnd();
        }
      }, 250);
    },
    handleTimerEnd() {
      this.stopTimer();
      this.audioAlert.play().catch(() => {});
      this.tab.periodOfTime = this.originalPeriodOfTime;
      this.audioLofi.currentTime = 0;
      this.$emit("changeStatus", false);
      this.$emit(
        "timer-end",
        this.tab.name == "Pomodoro" ? appConfig.short : appConfig.pomodoro
      );
    },
    stopTimer() {
      clearInterval(this.timer);
      this.timer = null;
      this.timerRunning = false;
      this.audioLofi.pause();
    },
    toggleTimer() {
      if (this.timerRunning) {
        this.stopTimer();
      } else {
        this.startTimer();
      }
    },
    skipTimer() {
      this.stopTimer();
      this.tab.periodOfTime = this.originalPeriodOfTime;
      this.timerRunning = false;
      this.audioLofi.currentTime = 0;
    },
  },
  beforeDestroy() {
    this.stopTimer();
  },
};
</script>
