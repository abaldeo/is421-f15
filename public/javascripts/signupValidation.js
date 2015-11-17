
$.validator.setDefaults( {
    submitHandler: function (form) {
        form.submit();
    }
} );
$( document ).ready( function () {
    $("#signup").validate({
        rules: {
            fname: "required",
            lname: "required",
            username: {
                required: true,
                minlength: 2
            },
            password: {
                required: true,
                minlength: 6
            },
            verified_password: {
                required: true,
                minlength: 6,
                equalTo: "#inputPassword"
            },
            email: {
                required: true,
                email: true
            },
            phone: {
                required: true,
                phoneUS: true
            }
        },
        messages: {
            fname: "Please enter your firstname",
            lname: "Please enter your lastname",
            username: {
                required: "Please enter a username",
                minlength: "Your username must consist of at least 2 characters"
            },
            password: {
                required: "Please provide a password",
                minlength: "Your password must be at least 6 characters long"
            },
            verified_password: {
                required: "Please provide a password",
                minlength: "Your password must be at least 6 characters long",
                equalTo: "Please enter the same password as above"
            },
            email: "Please enter a valid email address",
            phone: "Please enter a valid mobile phone number"
        },
        errorElement: "em",
        errorPlacement: function (error, element) {
            // Add the `help-block` class to the error element
            error.addClass("help-block");
            if (element.prop("type") === "checkbox") {
                error.insertAfter(element.parent("label"));
            } else {
                error.insertAfter(element);
            }
        },
        highlight: function (element, errorClass, validClass) {
            $(element).parent(".col-md-8").addClass("has-error").removeClass("has-success");
        },
        unhighlight: function (element, errorClass, validClass) {
            $(element).parent(".col-md-8").addClass("has-success").removeClass("has-error");
        }
    });
});