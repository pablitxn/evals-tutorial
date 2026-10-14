# Read-only consultation: the actual prepared-agent input boundary.
# Runtime Microsoft Agent Framework invocation is owned by ET-WP-05.
# This excerpt is not a mock model response or a hidden reference answer.
def agent_input(dataset_example):
    """The trusted supervisor supplies only input, never expected or fixtures."""
    return dataset_example["input"]
