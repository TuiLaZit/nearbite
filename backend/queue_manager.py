import asyncio
import inspect
import threading
import time
from collections import deque


MAX_QUEUE_LENGTH = 50
REQUESTS_PER_SECOND = 5
WORKER_INTERVAL_SECONDS = 1.0 / REQUESTS_PER_SECOND


class QueueFullError(Exception):
    """Raised when a restaurant queue is already at max capacity."""

    status_code = 429


class _QueueJob:
    def __init__(self, job_function, queue_position):
        self.job_function = job_function
        self.queue_position = queue_position
        self.done_event = threading.Event()
        self.result = None
        self.error = None
        self.enqueued_at = time.monotonic()
        self.started_at = None
        self.finished_at = None


class _RestaurantQueueState:
    def __init__(self):
        self.queue = deque()
        self.is_processing = False


_restaurant_queues = {}
_queue_lock = threading.Lock()
_worker_started = False
_worker_started_lock = threading.Lock()


def _execute_job(job_function):
    result = job_function()
    if inspect.isawaitable(result):
        return asyncio.run(result)
    return result


def _process_one_job_for_restaurant(restaurant_id):
    key = str(restaurant_id)

    with _queue_lock:
        state = _restaurant_queues.get(key)
        if state is None:
            return

        if state.is_processing:
            return

        if not state.queue:
            return

        job = state.queue.popleft()
        state.is_processing = True
        queue_length_after_pop = len(state.queue)
        job.started_at = time.monotonic()

    waited_ms = int((job.started_at - job.enqueued_at) * 1000)

    print(
        f"[queue] start restaurant={key} queue_position={job.queue_position} waited_ms={waited_ms} queue_length_after_pop={queue_length_after_pop}"
    )

    try:
        job.result = _execute_job(job.job_function)
    except Exception as exc:
        job.error = exc
        print(
            f"[queue] failed job restaurant={key} queue_length_remaining={queue_length_after_pop} error={exc}"
        )
    finally:
        job.finished_at = time.monotonic()
        run_ms = 0
        if job.started_at is not None:
            run_ms = int((job.finished_at - job.started_at) * 1000)

        with _queue_lock:
            current_state = _restaurant_queues.get(key)
            queue_length_remaining = 0
            if current_state is not None:
                queue_length_remaining = len(current_state.queue)
                current_state.is_processing = False
                if not current_state.queue:
                    _restaurant_queues.pop(key, None)

        print(
            f"[queue] done restaurant={key} queue_position={job.queue_position} waited_ms={waited_ms} run_ms={run_ms} queue_length_remaining={queue_length_remaining}"
        )

        job.done_event.set()


def _worker_loop():
    while True:
        time.sleep(WORKER_INTERVAL_SECONDS)
        with _queue_lock:
            restaurant_ids = list(_restaurant_queues.keys())

        # Mỗi tick xử lý tối đa 1 job cho mỗi restaurant,
        # đảm bảo 5 req/s/restaurant và FIFO theo từng queue.
        for restaurant_id in restaurant_ids:
            _process_one_job_for_restaurant(restaurant_id)


def _ensure_worker_started():
    global _worker_started

    with _worker_started_lock:
        if _worker_started:
            return

        threading.Thread(target=_worker_loop, daemon=True).start()
        _worker_started = True


def add_to_queue(restaurant_id, job_function, timeout_seconds=None, include_meta=False):
    """
    Add one job to a restaurant-specific queue and wait for completion.

    Args:
        restaurant_id: Restaurant identifier.
        job_function: Callable (sync or async) with request logic.
        timeout_seconds: Optional wait timeout.

    Returns:
        Result from job_function.

    Raises:
        QueueFullError: when queue length is over limit.
        Exception: any exception raised by job_function.
    """
    if restaurant_id is None:
        raise ValueError("restaurant_id is required")

    if not callable(job_function):
        raise ValueError("job_function must be callable")

    _ensure_worker_started()
    key = str(restaurant_id)

    with _queue_lock:
        state = _restaurant_queues.get(key)
        if state is None:
            state = _RestaurantQueueState()
            _restaurant_queues[key] = state

        if len(state.queue) >= MAX_QUEUE_LENGTH:
            raise QueueFullError(
                f"Queue for restaurant {key} is full (max {MAX_QUEUE_LENGTH})"
            )

        queue_position = len(state.queue) + 1
        job = _QueueJob(job_function, queue_position=queue_position)
        state.queue.append(job)
        estimated_wait_ms = int(((queue_position - 1) / REQUESTS_PER_SECOND) * 1000)
        print(
            f"[queue] enqueue restaurant={key} queue_position={queue_position} est_wait_ms={estimated_wait_ms} queue_length={len(state.queue)}"
        )

    finished = job.done_event.wait(timeout=timeout_seconds)
    if not finished:
        raise TimeoutError(f"Queue job timeout for restaurant {key}")

    if job.error:
        raise job.error

    if include_meta:
        wait_ms = 0
        total_ms = 0
        if job.started_at is not None:
            wait_ms = int((job.started_at - job.enqueued_at) * 1000)
        if job.finished_at is not None:
            total_ms = int((job.finished_at - job.enqueued_at) * 1000)

        return job.result, {
            "queue_position": job.queue_position,
            "queue_wait_ms": wait_ms,
            "queue_total_ms": total_ms,
        }

    return job.result
