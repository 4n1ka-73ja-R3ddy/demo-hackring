"""Content categories and the text prompts the zero-shot model compares frames against.

Ids match the frontend (src/types.ts CategoryId). Each category has the same
number of prompts so no category is favoured by having more of them.
"""

CATEGORIES: dict[str, dict] = {
    "education": {
        "label": "Education",
        "prompts": [
            "a teacher giving a lecture in a classroom",
            "a presentation slide full of text and diagrams",
            "a person explaining something at a whiteboard",
            "a screen recording of a coding tutorial",
        ],
    },
    "sports": {
        "label": "Sports",
        "prompts": [
            "athletes playing a match in a stadium",
            "a cricket match on a pitch",
            "a football game on a grass field",
            "a basketball game on a court",
        ],
    },
    "vlog": {
        "label": "Vlog",
        "prompts": [
            "a person talking to a handheld selfie camera",
            "a vlogger filming their daily life",
            "a person speaking to the camera at home",
            "a casual selfie video of a person walking outside",
        ],
    },
    "food": {
        "label": "Food / Cooking",
        "prompts": [
            "cooking food in a kitchen",
            "a close-up of a plated dish of food",
            "hands chopping vegetables on a cutting board",
            "a pan frying food on a stove",
        ],
    },
    "podcast": {
        "label": "Podcast",
        "prompts": [
            "people talking into large microphones in a podcast studio",
            "a podcast host wearing headphones in front of a microphone",
            "two people having a conversation at a table with microphones",
            "a video podcast recording setup",
        ],
    },
    "interview": {
        "label": "Interview",
        "prompts": [
            "a person sitting and answering questions in an interview",
            "a journalist interviewing someone",
            "a seated interview with a lapel microphone",
            "a talking head interview with a blurred background",
        ],
    },
    "travel": {
        "label": "Travel",
        "prompts": [
            "a scenic landscape at a travel destination",
            "a tourist visiting a famous landmark",
            "a busy street in a foreign city",
            "a view of mountains, beaches or a historic palace",
        ],
    },
    "gaming": {
        "label": "Gaming",
        "prompts": [
            "a screenshot of a video game",
            "first person shooter gameplay",
            "a video game with a heads-up display",
            "a gamer streaming gameplay with a webcam overlay",
        ],
    },
    "product": {
        "label": "Product / Review",
        "prompts": [
            "a person reviewing a gadget",
            "unboxing a new product",
            "a close-up of a smartphone or laptop being shown",
            "hands demonstrating a consumer product",
        ],
    },
    "business": {
        "label": "Business",
        "prompts": [
            "a business presentation in an office",
            "a corporate meeting in a conference room",
            "a software product demo on a computer screen",
            "a company promotional video with a logo",
        ],
    },
    "entertainment": {
        "label": "Entertainment",
        "prompts": [
            "a music performance on stage",
            "a stand-up comedy show",
            "a scene from a movie",
            "people dancing at a party",
        ],
    },
}

# Not predicted from prompts: assigned when no category is a clear match.
OTHER = {"id": "other", "label": "Other"}

ALL_CATEGORY_IDS = list(CATEGORIES) + [OTHER["id"]]


def label(cat_id: str) -> str:
    if cat_id == OTHER["id"]:
        return OTHER["label"]
    return CATEGORIES[cat_id]["label"]
